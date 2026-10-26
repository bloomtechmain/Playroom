import "server-only";
import { actorOf, createSession, destroySession, type Actor } from "../auth";
import { db } from "../db";
import { badRequest, HttpError } from "../http";
import { mutate, type Mut } from "../mutation";
import { hashPassword, isStrongPassword, verifyPassword } from "../password";

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

export async function changePassword(m: Mut, current: string, next: string) {
  const u = await m.tx.one<{ id: string; name: string; password_hash: string }>("SELECT id, name, password_hash FROM users WHERE id = $1", [m.actor.id]);
  if (!u || !(await verifyPassword(current, u.password_hash))) throw badRequest("Current password is incorrect");
  if (!isStrongPassword(next)) throw badRequest("Use 8+ characters with letters and numbers");
  if (next === current) throw badRequest("Choose a different password");
  await m.update("users", u.id, { mustChangePassword: false, passwordHash: await hashPassword(next) });
  await m.log("Auth", "Updated", `${u.name} changed password`);
}
