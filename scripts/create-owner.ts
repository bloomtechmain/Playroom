/**
 * First sign-in for a real (non-demo) installation: creates the standard roles and an Owner account.
 *   npm run db:create-owner -- <username> <password> "<Full name>" [email]
 */
import "dotenv/config";
import { DEFAULT_ROLES } from "../src/lib/permissions";
import { isStrongPassword, hashPassword } from "../src/server/password";
import { createPool, transaction } from "../src/server/db/pool";
import { insertRow } from "../src/server/collections";
import { uid } from "../src/lib/utils";

async function main() {
  const [username, password, name, email = ""] = process.argv.slice(2);
  if (!username || !password || !name) {
    console.log('Usage: npm run db:create-owner -- <username> <password> "<Full name>" [email]');
    process.exit(1);
  }
  if (!isStrongPassword(password)) throw new Error("Use a password of 8+ characters with letters and numbers");
  const pool = createPool();
  try {
    await transaction(pool, async (sql) => {
      for (const r of DEFAULT_ROLES) await sql.query("INSERT INTO roles (id, name, description, permissions, locked) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [r.id, r.name, r.description, r.permissions, r.locked ?? null]);
      if (await sql.one("SELECT 1 FROM users WHERE lower(username) = lower($1)", [username])) throw new Error(`User "${username}" already exists`);
      await insertRow(sql, "users", { id: uid("u"), name, username: username.toLowerCase(), email, phone: "", roleId: "owner", active: true, createdAt: new Date().toISOString() }, { extra: { passwordHash: await hashPassword(password) } });
      await sql.query("SELECT nextval('state_rev')");
    });
    console.log(`Owner account "${username.toLowerCase()}" created — sign in at /login.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
