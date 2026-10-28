/**
 * Empties the database so the system can be tried from zero.
 * Keeps the roles and the named user accounts (default: admin); everything else — zones, prices,
 * products, packages, customers, tickets, sales, bookings, staff, training, KPI marks, payroll, activity,
 * backups, queued WhatsApp messages — is deleted
 * and business settings go back to the defaults in database.sql.
 *   npm run db:clear                 — keep only "admin"
 *   npm run db:clear -- admin owner  — keep these usernames
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPool, transaction } from "../src/server/db/pool";
import { commitRev } from "../src/server/rev";

const DATA_TABLES = [
  "zones", "rate_plans", "price_rules", "promotions", "customers", "children", "tickets", "transactions",
  "products", "sales", "shifts", "refunds", "party_packages", "addons", "bookings", "expenses",
  "employees", "attendance", "payroll_runs", "activity", "backups", "trainings", "evaluations",
  // messages queued for WhatsApp (the linked phone itself, in whatsapp_auth, stays linked)
  "whatsapp_messages",
];

async function main() {
  const keep = (process.argv.slice(2).length ? process.argv.slice(2) : ["admin"]).map((u) => u.toLowerCase());
  // the default settings document lives in database.sql, so a cleared database matches a fresh install
  const defaults = readFileSync(join(__dirname, "..", "database.sql"), "utf8").match(/INSERT INTO settings \(id, data\) VALUES \(1, '([\s\S]*?)'::jsonb\)/)?.[1];
  if (!defaults) throw new Error("Couldn't find the default settings in database.sql");

  const pool = createPool();
  try {
    await transaction(pool, async (sql) => {
      const kept = await sql.query<{ username: string }>("SELECT username FROM users WHERE lower(username) = ANY($1::text[])", [keep]);
      if (!kept.length) throw new Error(`None of these accounts exist: ${keep.join(", ")} — nothing was deleted`);
      await sql.query(`TRUNCATE ${DATA_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
      await sql.query("DELETE FROM users WHERE lower(username) <> ALL($1::text[])", [keep]); // their sessions go with them
      await sql.query("UPDATE settings SET data = $1::jsonb WHERE id = 1", [defaults]);
      await commitRev(sql, { reset: true });
      console.log(`Database cleared. Kept ${kept.length} account(s): ${kept.map((u) => u.username).join(", ")} and all roles.`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
