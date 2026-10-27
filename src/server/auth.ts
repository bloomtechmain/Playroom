import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@/lib/types";
import { realDb as db, type Sql } from "./db";
import { HttpError } from "./http";
import { sha256 } from "./password";
import { PRACTICE_COOKIE } from "./practice";

const COOKIE = "pr_session";
const TTL_MS = 7 * 24 * 3600 * 1000;

export interface Actor {
  id: string;
  name: string;
  roleId: string;
  can: (perm: string) => boolean;
}

export const SYSTEM: Actor = { id: "system", name: "System", roleId: "", can: () => false };

export function actorOf(user: Pick<User, "id" | "name" | "roleId">, role: { permissions: string[]; locked?: boolean | null } | undefined): Actor {
  const perms = new Set(role?.permissions ?? []);
  return { id: user.id, name: user.name, roleId: user.roleId, can: (p) => !!role && (!!role.locked || perms.has(p)) };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, now(), $3)", [sha256(token), userId, new Date(now + TTL_MS).toISOString()]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
  (await cookies()).delete(PRACTICE_COOKIE); // every sign-in starts on the real data
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.query("DELETE FROM sessions WHERE id = $1", [sha256(token)]);
  jar.delete(COOKIE);
  jar.delete(PRACTICE_COOKIE);
}

/** Sign a user out everywhere (password reset by an administrator). */
export async function endSessions(sql: Sql, userId: string) {
  await sql.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

/** Sign a user out on every other device, keeping this browser's session (own password change). */
export async function endOtherSessions(sql: Sql, userId: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  await sql.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [userId, token ? sha256(token) : ""]);
}

/** The signed-in staff member, or null. Deactivated users lose access immediately. Always checked against the real database. */
export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await db.one<{ id: string; name: string; role_id: string; active: boolean; permissions: string[] | null; locked: boolean | null }>(
    `SELECT u.id, u.name, u.role_id, u.active, r.permissions, r.locked
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row || !row.active) return null;
  return actorOf({ id: row.id, name: row.name, roleId: row.role_id }, row.permissions ? { permissions: row.permissions, locked: row.locked } : undefined);
}

/** Require a signed-in user; with `perms`, require at least one of them. */
export async function requireActor(...perms: string[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new HttpError(401, "Please sign in again");
  if (perms.length && !perms.some((p) => actor.can(p))) throw new HttpError(403, "You don't have permission to do that");
  return actor;
}
