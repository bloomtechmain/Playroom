import "server-only";
import { randomUUID } from "node:crypto";
import { actorOf, createSession, destroySession, endOtherSessions, type Actor } from "../auth";
import { db } from "../db";
import { badRequest, HttpError } from "../http";
import { mutate, type Mut } from "../mutation";
import { hashPassword, isStrongPassword, verifyPassword } from "../password";
import { inPractice, onRealData } from "../practice";
import { clear, note, recent } from "../rateLimit";

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

// Slow down password guessing. Locks are per username *and* address, so someone elsewhere typing wrong
// passwords can't lock the owner out at the venue: 5 failures for a username from one address, 20 from one
// address overall, or 100 for one username from anywhere (a spread-out attack), within 15 minutes.
const WINDOW = 15 * 60_000;
const TOO_MANY = "Too many attempts — wait a few minutes and try again";

/** Throttled password check shared by sign-in and the manager sign-off at the counter. */
export async function checkCredentials<T extends { password_hash: string }>(username: string, password: string, ip: string, find: (name: string) => Promise<T | undefined>) {
  const name = username.trim().toLowerCase();
  const keys = [`login:${name}@${ip}`, `login-ip:${ip}`, `login-user:${name}`];
  if (recent(keys[0], WINDOW) >= 5 || recent(keys[1], WINDOW) >= 20 || recent(keys[2], WINDOW) >= 100) throw new HttpError(429, TOO_MANY);
  const u = await find(username);
  // unknown usernames still pay for a hash so response times don't reveal which usernames exist
  const ok = await verifyPassword(password, u?.password_hash ?? (await dummyHash()));
  if (!u || !ok) {
    keys.forEach(note);
    return undefined;
  }
  clear(keys[0]);
  return u;
}

let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hashPassword(randomUUID()));

export const login = (username: string, password: string, ip: string) => onRealData(() => signIn(username, password, ip));

async function signIn(username: string, password: string, ip: string) {
  const u = await checkCredentials(username, password, ip, findByLogin);
  if (!u) throw new HttpError(401, "Wrong username or password");
  if (!u.active) throw new HttpError(403, "This account has been deactivated. Please contact an administrator.");
  await createSession(u.id);
  return mutate(actorFor(u), async (m) => {
    await m.update("users", u.id, { lastLogin: new Date().toISOString() });
    await m.log("Auth", "Signed in", `${u.name} signed in`);
  });
}

export const logout = (actor: Actor | null) =>
  onRealData(async () => {
    if (actor) await mutate(actor, (m) => m.log("Auth", "Signed out", ""));
    await destroySession();
  });

export async function changePassword(m: Mut, current: string, next: string) {
  // passwords live in the real database; a change in the practice copy would sign nobody in
  if (inPractice()) throw badRequest("Leave practice mode to change your password");
  const u = await m.tx.one<{ id: string; name: string; password_hash: string }>("SELECT id, name, password_hash FROM users WHERE id = $1", [m.actor.id]);
  if (!u || !(await verifyPassword(current, u.password_hash))) throw badRequest("Current password is incorrect");
  if (!isStrongPassword(next)) throw badRequest("Use 8+ characters with letters and numbers");
  if (next === current) throw badRequest("Choose a different password");
  await m.update("users", u.id, { mustChangePassword: false, passwordHash: await hashPassword(next) });
  // anyone else signed in with the old password is signed out
  await endOtherSessions(m.tx, u.id);
  await m.log("Auth", "Updated", `${u.name} changed password`);
}
