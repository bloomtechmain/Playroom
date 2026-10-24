/**
 * Creates the schema from database.sql on an empty database (same as `psql -f database.sql`).
 *   npm run db:init
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPool, wrap } from "../src/server/db/pool";

async function main() {
  const pool = createPool();
  try {
    const exists = await wrap(pool).one("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
    if (exists) {
      console.log("The schema already exists in this database — nothing to do. (database.sql is for fresh databases.)");
      return;
    }
    await pool.query(readFileSync(join(__dirname, "..", "database.sql"), "utf8"));
    console.log("Schema created from database.sql");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
