/**
 * Fills the database with the demo data set (about three months of history).
 *   npm run db:seed            — only if the database is empty
 *   npm run db:seed -- --force — wipe business data and re-seed
 */
import "dotenv/config";
import { buildSeed } from "../src/lib/seed";
import { createPool, transaction, wrap } from "../src/server/db/pool";
import { importSnapshot } from "../src/server/snapshot";

async function main() {
  const pool = createPool();
  try {
    const force = process.argv.includes("--force");
    const { n } = (await wrap(pool).one<{ n: number }>("SELECT count(*)::int AS n FROM users"))!;
    if (n > 0 && !force) {
      console.log(`Database already has ${n} users — nothing to do. Use "npm run db:seed -- --force" to rebuild the demo data.`);
      return;
    }
    const snap = buildSeed();
    await transaction(pool, async (sql) => {
      const { backups } = await importSnapshot(sql, snap);
      // the demo shows a few earlier automatic backups (entries only, no stored snapshot)
      const has = await sql.one("SELECT 1 FROM backups LIMIT 1");
      if (!has) for (const [i, b] of backups.entries()) await sql.query("INSERT INTO backups (id, at, size, auto) VALUES ($1, $2, $3, $4)", [`seed-backup-${i}`, b.at, b.size, b.auto]);
      await sql.query("SELECT nextval('state_rev')");
    });
    const counts = Object.entries(snap)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
      .join(", ");
    console.log(`Seeded demo data — ${counts}`);
    console.log("Sign in with any demo account (owner, admin, manager, cashier, reception, party, accounts) — password demo123");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
