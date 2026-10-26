import "server-only";
import { startOfDay } from "date-fns";
import type { DB as Snapshot } from "@/lib/seed";
import { checkExpenseCategories } from "@/lib/accounting";
import type { Settings } from "@/lib/types";
import { uid } from "@/lib/utils";
import { SYSTEM } from "../auth";
import { db, transaction, type Sql } from "../db";
import { badRequest, HttpError } from "../http";
import { bumpRev, diff, type Mut } from "../mutation";
import { exportSnapshot, importSnapshot } from "../snapshot";

/** Settings keys other modules may change (holidays from Pricing, EPF/ETF from Payroll). */
const SETTING_PERMS: Record<string, string> = {
  holidays: "pricing.edit",
  expenseCategories: "expenses.edit",
  epfEnabled: "payroll.run",
  etfEnabled: "payroll.run",
  epfEmployeePct: "payroll.run",
  epfEmployerPct: "payroll.run",
  etfPct: "payroll.run",
  epfIncludesAllowance: "payroll.run",
  whatsapp: "whatsapp.connect",
};

export async function setSettings(m: Mut, patch: Partial<Settings>, detail?: string) {
  const { backups, ...changes } = patch;
  void backups; // backups are created through the backup endpoint, never written directly
  for (const k of Object.keys(changes))
    if (!m.actor.can("settings.edit") && !(SETTING_PERMS[k] && m.actor.can(SETTING_PERMS[k]))) throw new HttpError(403, "You don't have permission to change that setting");
  if (!Object.keys(changes).length) return;
  if (changes.expenseCategories) {
    const problem = checkExpenseCategories(changes.expenseCategories);
    if (problem) throw badRequest(problem);
  }
  const { backups: _b, ...before } = await m.settings();
  void _b;
  await m.saveSettings({ ...before, ...changes });
  await m.log("Settings", "Changed setting", detail ?? Object.keys(changes).join(", "), undefined, diff(before as never, changes as never));
}

const KEEP_BACKUPS = 14;

export async function createBackup(sql: Sql, auto: boolean, by: string) {
  const snapshot = await exportSnapshot(sql);
  const json = JSON.stringify(snapshot);
  await sql.query("INSERT INTO backups (id, at, size, auto, snapshot, created_by) VALUES ($1, now(), $2, $3, $4, $5)", [uid("bk"), json.length, auto, json, by]);
  await sql.query("DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY at DESC LIMIT $1)", [KEEP_BACKUPS]);
  return snapshot;
}

export async function manualBackup(m: Mut) {
  const snapshot = await createBackup(m.tx, false, m.actor.id);
  m.markSettingsChanged();
  await m.log("Settings", "Changed setting", "Manual backup created");
  return snapshot;
}

export async function downloadBackup(id: string) {
  const b = await db.one<{ at: string; snapshot: Snapshot | null }>("SELECT at, snapshot FROM backups WHERE id = $1", [id]);
  if (!b) throw new HttpError(404, "Backup not found");
  if (!b.snapshot) throw badRequest("This backup entry has no stored snapshot");
  return { at: b.at, snapshot: b.snapshot };
}

export async function restoreBackup(m: Mut, snap: Snapshot, fileName: string) {
  try {
    await importSnapshot(m.tx, snap);
  } catch (e) {
    if (e instanceof Error && e.message === "Not a Playroom backup") throw badRequest("That file isn't a Playroom backup");
    throw e;
  }
  await m.log("Settings", "Restored backup", fileName);
  m.requestReload();
}

let lastHousekeeping = 0;

/**
 * Daily chores: tickets still "active" from a previous day become
 * "expired", and one automatic backup is taken per day. Runs at most once a minute per server.
 */
export async function housekeeping() {
  if (Date.now() - lastHousekeeping < 60_000) return;
  lastHousekeeping = Date.now();
  const midnight = startOfDay(new Date()).toISOString();
  await transaction(async (sql) => {
    await sql.query("SELECT pg_advisory_xact_lock(hashtext('housekeeping'))");
    let changed = false;
    const expired = await sql.query("UPDATE tickets SET status = 'expired' WHERE status = 'active' AND check_in < $1 RETURNING id", [midnight]);
    if (expired.length) changed = true;
    const backedUpToday = await sql.one("SELECT 1 FROM backups WHERE at >= $1 LIMIT 1", [midnight]);
    const hasUsers = await sql.one("SELECT 1 FROM users LIMIT 1");
    if (!backedUpToday && hasUsers) {
      await createBackup(sql, true, SYSTEM.id);
      changed = true;
    }
    if (changed) await bumpRev(sql);
  });
}
