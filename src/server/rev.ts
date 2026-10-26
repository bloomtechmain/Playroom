import { tableName, type CollectionKey } from "./collections";
import type { Sql } from "./db/pool";

export interface Changes {
  /** ids written per collection */
  upserts?: Partial<Record<CollectionKey, Iterable<string>>>;
  /** ids deleted per collection */
  removes?: Partial<Record<CollectionKey, Iterable<string>>>;
  settings?: boolean;
  /** everything was replaced (restore / seed / reset): screens reload in full */
  reset?: boolean;
}

/**
 * Give this transaction the next state revision and stamp the rows it wrote with it. The lock is held
 * until commit, so revisions become visible in order: a screen that has seen revision N has seen every
 * change up to N, and `rev > N` fetches exactly what it's missing. Call it last, just before COMMIT.
 */
export async function commitRev(sql: Sql, ch: Changes): Promise<number> {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext('state-rev'))");
  const { rev } = (await sql.one<{ rev: number }>("SELECT nextval('state_rev') AS rev"))!;
  for (const [key, ids] of Object.entries(ch.upserts ?? {}) as [CollectionKey, Iterable<string>][]) {
    const list = [...ids];
    if (!list.length) continue;
    await sql.query(`UPDATE ${tableName(key)} SET rev = $1 WHERE id = ANY($2::text[])`, [rev, list]);
    // written again after being deleted: it exists now
    await sql.query("DELETE FROM deleted_rows WHERE collection = $1 AND id = ANY($2::text[])", [key, list]);
  }
  for (const [key, ids] of Object.entries(ch.removes ?? {}) as [CollectionKey, Iterable<string>][]) {
    const list = [...ids];
    if (list.length)
      await sql.query(
        "INSERT INTO deleted_rows (collection, id, rev) SELECT $1, unnest($2::text[]), $3 ON CONFLICT (collection, id) DO UPDATE SET rev = EXCLUDED.rev",
        [key, list, rev],
      );
  }
  await sql.query(
    `INSERT INTO state_version (id, rev, settings_rev, reset_rev) VALUES (1, $1, $1, $1)
     ON CONFLICT (id) DO UPDATE SET rev = $1,
       settings_rev = CASE WHEN $2 THEN $1 ELSE state_version.settings_rev END,
       reset_rev = CASE WHEN $3 THEN $1 ELSE state_version.reset_rev END`,
    [rev, !!ch.settings || !!ch.reset, !!ch.reset],
  );
  return rev;
}

export interface Version {
  rev: number;
  settings_rev: number;
  reset_rev: number;
}

/** The last committed revision (not the sequence, which runs ahead of uncommitted and rolled-back writes). */
export async function readVersion(sql: Sql): Promise<Version> {
  return (await sql.one<Version>("SELECT rev, settings_rev, reset_rev FROM state_version WHERE id = 1")) ?? { rev: 0, settings_rev: 0, reset_rev: 0 };
}
