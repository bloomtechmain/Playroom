import "server-only";
import { randomInt } from "node:crypto";
import { uid } from "@/lib/utils";
import { actorOf, createSession, DEMO_MODE, destroySession, type Actor } from "../auth";
import { db } from "../db";
import { badRequest, HttpError } from "../http";
import { mutate, type Mut } from "../mutation";
import { hashPassword, isStrongPassword, sha256, verifyPassword } from "../password";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role_id: string;
  active: boolean;
  password_hash: string;
  permissions: string[] | null;
  locked: boolean | null;
}

const USER_WITH_ROLE = `SELECT u.id, u.name, u.email, u.role_id, u.active, u.password_hash, r.permissions, r.locked
                          FROM users u LEFT JOIN roles r ON r.id = u.role_id`;

const actorFor = (u: UserRow) => actorOf({ id: u.id, name: u.name, roleId: u.role_id }, u.permissions ? { permissions: u.permissions, locked: u.locked } : undefined);

const findByLogin = (name: string) => db.one<UserRow>(`${USER_WITH_ROLE} WHERE lower(u.username) = lower($1)`, [name.trim()]);

// Slow down password guessing: 5 failures per username in 15 minutes locks that username for a while.
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;
function tooManyFailures(key: string) {
  const recent = (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
  failures.set(key, recent);
  return recent.length >= 5;
}
const noteFailure = (key: string) => failures.set(key, [...(failures.get(key) ?? []), Date.now()]);

export async function login(username: string, password: string) {
  const key = username.trim().toLowerCase();
  if (tooManyFailures(key)) throw new HttpError(429, "Too many attempts — wait a few minutes and try again");
  const u = await findByLogin(username);
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    noteFailure(key);
    throw new HttpError(401, "Wrong username or password");
  }
  if (!u.active) throw new HttpError(403, "This account has been deactivated. Please contact an administrator.");
  failures.delete(key);
  await createSession(u.id);
  return mutate(actorFor(u), async (m) => {
    await m.update("users", u.id, { lastLogin: new Date().toISOString() });
    await m.log("Auth", "Signed in", `${u.name} signed in`);
  });
}

export async function logout(actor: Actor | null) {
  if (actor) await mutate(actor, (m) => m.log("Auth", "Signed out", ""));
  await destroySession();
}

/** Demo only: jump to another account without its password. */
export async function switchUser(userId: string) {
  const u = await db.one<UserRow>(`${USER_WITH_ROLE} WHERE u.id = $1`, [userId]);
  if (!u || !u.active) throw badRequest("That account isn't available");
  await destroySession();
  await createSession(u.id);
  await mutate(actorFor(u), (m) => m.log("Auth", "Switched user", `Demo switch to ${u.name}`));
}

export async function changePassword(m: Mut, current: string, next: string) {
  const u = await m.tx.one<{ id: string; name: string; password_hash: string }>("SELECT id, name, password_hash FROM users WHERE id = $1", [m.actor.id]);
  if (!u || !(await verifyPassword(current, u.password_hash))) throw badRequest("Current password is incorrect");
  if (!isStrongPassword(next)) throw badRequest("Use 8+ characters with letters and numbers");
  if (next === current) throw badRequest("Choose a different password");
  await m.update("users", u.id, { mustChangePassword: false, passwordHash: await hashPassword(next) });
  await m.log("Auth", "Updated", `${u.name} changed password`);
}

const findForReset = (who: string) => db.one<UserRow>(`${USER_WITH_ROLE} WHERE lower(u.username) = lower($1) OR u.email = $1 LIMIT 1`, [who.trim()]);

/**
 * Starts a password reset. There is no mail service configured, so in demo mode the code is
 * returned to the screen (as the demo did); otherwise staff ask an administrator for a temporary password.
 */
export async function forgotPassword(who: string) {
  if (!DEMO_MODE) throw new HttpError(501, "Password reset by email isn't set up — ask an administrator to reset your password");
  const u = await findForReset(who);
  if (!u) throw badRequest("No account found with that username or email");
  const code = String(randomInt(100000, 1000000));
  await db.query("INSERT INTO password_resets (id, user_id, code_hash, expires_at) VALUES ($1, $2, $3, now() + interval '15 minutes')", [uid("pw"), u.id, sha256(code)]);
  return { code };
}

export async function resetPassword(who: string, code: string, next: string) {
  const u = await findForReset(who);
  if (!u) throw badRequest("No account found with that username or email");
  const r = await db.one<{ id: string; code_hash: string; attempts: number; expired: boolean }>(
    `SELECT id, code_hash, attempts, expires_at < now() AS expired
       FROM password_resets WHERE user_id = $1 AND used_at IS NULL
      ORDER BY expires_at DESC LIMIT 1`,
    [u.id],
  );
  if (!r || r.expired || r.attempts >= 5) throw badRequest("That code has expired — request a new one");
  if (r.code_hash !== sha256(code.trim())) {
    await db.query("UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1", [r.id]);
    throw badRequest("That code doesn't match");
  }
  if (!isStrongPassword(next)) throw badRequest("Use at least 8 characters with letters and numbers");
  const passwordHash = await hashPassword(next);
  await mutate(actorFor(u), async (m) => {
    await m.tx.query("UPDATE password_resets SET used_at = now() WHERE id = $1", [r.id]);
    await m.tx.query("UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2", [passwordHash, u.id]);
    await m.log("Auth", "Password reset", `${u.name} reset password via emailed code`);
  });
}

/** Demo login screen: the clickable account list. Empty outside demo mode. */
export async function demoAccounts() {
  if (!DEMO_MODE) return { users: [], roles: [] };
  const users = await db.query('SELECT id, name, username, role_id AS "roleId", active FROM users ORDER BY seq');
  const roles = await db.query("SELECT id, name FROM roles ORDER BY seq");
  return { users, roles };
}
