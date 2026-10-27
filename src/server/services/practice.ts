import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Actor } from "../auth";
import { insertRow, toItem } from "../collections";
import { practicePool, realDb } from "../db";
import { wrap, type Sql } from "../db/pool";
import { HttpError } from "../http";
import { mutate } from "../mutation";
import { onRealData } from "../practice";
import { commitRev } from "../rev";
import { exportSnapshot, importSnapshot } from "../snapshot";

/**
 * The practice database: same schema as the real one (database.sql), filled with a copy of the real data
 * the first time anyone opens practice mode, and again whenever a manager resets it.
 */

/** Run `fn` on one practice-database connection, one caller at a time (two people opening it at once). */
async function exclusive<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  let client;
  try {
    client = await practicePool().connect();
  } catch (e) {
    console.error("Practice database:", e);
    throw new HttpError(503, "The practice database isn't set up on this server yet");
  }
  const sql = wrap(client);
  try {
    // never rebuild anything but the practice copy
    const { name } = (await sql.one<{ name: string }>("SELECT current_database() AS name"))!;
    const real = (await realDb.one<{ name: string }>("SELECT current_database() AS name"))!;
    if (!name.endsWith("_practice") || name === real.name) throw new Error(`Refusing to use "${name}" as the practice database`);
    await sql.query("SELECT pg_advisory_lock(hashtext('practice-setup'))");
    return await fn(sql);
  } finally {
    await sql.query("SELECT pg_advisory_unlock(hashtext('practice-setup'))").catch(() => undefined);
    client.release();
  }
}

/** Drop whatever is in the practice database and create the current schema. */
async function rebuildSchema(sql: Sql) {
  const tables = await sql.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'");
  if (tables.length) await sql.query(`DROP TABLE ${tables.map((t) => `public."${t.name}"`).join(", ")} CASCADE`);
  const seqs = await sql.query<{ name: string }>("SELECT sequencename AS name FROM pg_sequences WHERE schemaname = 'public'");
  if (seqs.length) await sql.query(`DROP SEQUENCE ${seqs.map((s) => `public."${s.name}"`).join(", ")} CASCADE`);
  await sql.query(readFileSync(join(process.cwd(), "database.sql"), "utf8"));
}

/** Replace the practice data with a fresh copy of the real data. */
async function copyRealData(sql: Sql) {
  await rebuildSchema(sql);
  const snapshot = await exportSnapshot(realDb);
  await sql.query("BEGIN");
  try {
    await importSnapshot(sql, snapshot);
    await commitRev(sql, { reset: true });
    await sql.query("COMMIT");
  } catch (e) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

/**
 * Make sure the practice copy exists (copy the real data the first time) and holds this person's
 * current account and role, so what the screens show matches what they're allowed to do.
 */
export async function openPractice(actor: Actor) {
  await exclusive(async (sql) => {
    const ready = await sql.one("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'state_version'");
    const filled = ready && (await sql.one("SELECT 1 FROM users LIMIT 1"));
    if (!filled) await copyRealData(sql);
    const role = await realDb.one("SELECT * FROM roles WHERE id = $1", [actor.roleId]);
    const user = await realDb.one("SELECT * FROM users WHERE id = $1", [actor.id]);
    if (!role || !user) return;
    await sql.query("BEGIN");
    try {
      await insertRow(sql, "roles", toItem("roles", role), { upsert: true });
      await insertRow(sql, "users", toItem("users", user), { upsert: true, extra: { passwordHash: user.password_hash } });
      await commitRev(sql, { upserts: { roles: [actor.roleId], users: [actor.id] } });
      await sql.query("COMMIT");
    } catch (e) {
      await sql.query("ROLLBACK").catch(() => undefined);
      throw e;
    }
  });
  await onRealData(() => mutate(actor, (m) => m.log("Settings", "Practice mode", `${actor.name} opened practice mode`)));
}

/** Throw away everything done in practice and start again from today's real data. */
export async function resetPractice(actor: Actor) {
  await exclusive(copyRealData);
  await onRealData(() => mutate(actor, (m) => m.log("Settings", "Practice mode", "Practice data reset to a fresh copy of the real data")));
}
