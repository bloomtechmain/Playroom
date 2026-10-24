import type { DB as Snapshot } from "@/lib/seed";
import type { Settings } from "@/lib/types";
import type { Sql } from "./db/pool";
import { COLLECTION_KEYS, insertMany, insertRow, tableName, toItems, type CollectionKey, type Collections } from "./collections";
import { hashPassword } from "./password";

/** Collections the original store kept newest-first (it prepended to them). */
export const NEWEST_FIRST = new Set<CollectionKey>(["activity", "refunds"]);

export async function readCollection<K extends CollectionKey>(sql: Sql, key: K, opts: { limit?: number; withHashes?: boolean } = {}) {
  const order = NEWEST_FIRST.has(key) ? "at DESC, seq DESC" : "seq";
  const rows = await sql.query(`SELECT * FROM ${tableName(key)} ORDER BY ${order}${opts.limit ? ` LIMIT ${Number(opts.limit)}` : ""}`);
  const items = toItems(key, rows) as unknown as Record<string, unknown>[];
  // backups keep the password hashes so a restore keeps everyone's sign-in working
  if (opts.withHashes && key === "users") items.forEach((it, i) => (it.passwordHash = rows[i].password_hash));
  return items as unknown as Collections[K];
}

export async function readSettings(sql: Sql): Promise<Settings> {
  const row = await sql.one<{ data: Omit<Settings, "backups"> }>("SELECT data FROM settings WHERE id = 1");
  const backups = await sql.query<Settings["backups"][number]>("SELECT id, at, size, auto FROM backups ORDER BY at DESC LIMIT 14");
  return { ...(row?.data as Omit<Settings, "backups">), backups: backups.reverse() };
}

export async function saveSettings(sql: Sql, data: Omit<Settings, "backups">) {
  await sql.query("INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data", [JSON.stringify(data)]);
}

/** Full export in the same shape as the demo's backup files (users carry password hashes, never plain text). */
export async function exportSnapshot(sql: Sql): Promise<Snapshot> {
  const out = {} as Record<string, unknown>;
  for (const key of COLLECTION_KEYS) out[key] = await readCollection(sql, key, { withHashes: true });
  out.settings = await readSettings(sql);
  out.seededAt = new Date().toISOString();
  return out as unknown as Snapshot;
}

/**
 * Replace all business data with a snapshot (seed, reset or restore). Users and roles are upserted
 * rather than truncated so the signed-in session survives when its user still exists.
 * Accepts the original demo's backup files too: plain-text `password` fields are hashed on the way in.
 */
export async function importSnapshot(sql: Sql, snap: Snapshot) {
  if (!Array.isArray(snap?.users) || !Array.isArray(snap?.tickets) || !Array.isArray(snap?.roles)) throw new Error("Not a Playroom backup");

  const data = COLLECTION_KEYS.filter((k) => k !== "users" && k !== "roles");
  await sql.query(`TRUNCATE ${data.map(tableName).join(", ")} RESTART IDENTITY CASCADE`);

  // roles → users (foreign key), then drop the ones that are gone
  for (const r of snap.roles) await insertRow(sql, "roles", r, { upsert: true });
  for (const u of snap.users as (Snapshot["users"][number] & { passwordHash?: string })[]) {
    const passwordHash = u.passwordHash ?? (await hashPassword(u.password || crypto.randomUUID()));
    await insertRow(sql, "users", u, { upsert: true, extra: { passwordHash } });
  }
  await sql.query("DELETE FROM users WHERE id <> ALL($1::text[])", [snap.users.map((u) => u.id)]);
  await sql.query("DELETE FROM roles WHERE id <> ALL($1::text[])", [snap.roles.map((r) => r.id)]);

  for (const key of data) {
    const list = ((snap as unknown as Record<string, Record<string, unknown>[]>)[key] ?? []).slice();
    // keep newest-first collections' ordering stable: insert oldest first so seq follows time
    if (NEWEST_FIRST.has(key)) list.reverse();
    await insertMany(sql, key, list);
  }

  const { backups, ...settings } = snap.settings;
  await saveSettings(sql, settings);
  return { backups: backups ?? [] };
}
