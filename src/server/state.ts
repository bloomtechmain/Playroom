import "server-only";
import type { Collections, Patch } from "@/lib/patch";
import type { Settings } from "@/lib/types";
import { today } from "@/lib/utils";
import type { Actor } from "./auth";
import { COLLECTION_KEYS, isCollection, tableName, toItems, type CollectionKey } from "./collections";
import { db } from "./db";
import { readVersion, type Version } from "./rev";
import { forActor } from "./visibility";
import { readCollection, readSettings } from "./snapshot";

/** Sensitive collections are only sent to roles that have a screen for them. */
const NEEDS: Partial<Record<CollectionKey, string[]>> = {
  expenses: ["expenses.view", "reports.view", "dashboard.view", "payroll.view"],
  payroll: ["payroll.view"],
  employees: ["hr.view", "hr.edit", "payroll.view"],
  attendance: ["hr.view", "hr.edit", "payroll.view"],
  trainings: ["hr.view", "hr.edit"],
  // KPI marks: administrators and the owner only
  evaluations: ["hr.evaluate"],
};

export interface AppState {
  rev: number;
  currentUserId: string;
  data: Collections & { settings: Settings };
}

/** Only what changed since the screen's revision (rows written, rows deleted, settings if they changed). */
export interface StateChanges {
  rev: number;
  currentUserId: string;
  patch: Patch;
}

const allowed = (actor: Actor, key: CollectionKey) => !NEEDS[key] || NEEDS[key]!.some((p) => actor.can(p));

/**
 * Everything the signed-in role may see — or, with `since` (the revision the screen already has), just the
 * changes after it. The revision is read first: anything committed after that is newer than it and simply
 * comes again with the next refresh, so the rows sent are never older than the revision claimed.
 */
export async function loadState(actor: Actor, since?: number): Promise<AppState | StateChanges> {
  const v = await readVersion(db);
  // a screen from before a restore/reset (or from another database) reloads in full
  if (since !== undefined && since >= v.reset_rev && since <= v.rev) return loadChanges(actor, since, v);
  const data = {} as Record<string, unknown>;
  await Promise.all(
    COLLECTION_KEYS.map(async (key) => {
      if (!allowed(actor, key)) data[key] = [];
      else if (key === "activity")
        // the audit trail for those allowed to see it; everyone else gets their own recent entries (My profile)
        data[key] = actor.can("activity.view")
          ? await readCollection(db, "activity", { limit: 1500 })
          : toItems("activity", await db.query("SELECT * FROM activity WHERE user_id = $1 ORDER BY at DESC LIMIT 50", [actor.id]));
      else data[key] = forActor(actor, key, await readCollection(db, key));
    }),
  );
  data.settings = await readSettings(db);
  return { rev: v.rev, currentUserId: actor.id, data: data as AppState["data"] };
}

async function loadChanges(actor: Actor, since: number, v: Version): Promise<StateChanges> {
  const patch: Patch = { rev: v.rev, upsert: {}, remove: {} };
  if (since === v.rev) return { rev: v.rev, currentUserId: actor.id, patch };
  await Promise.all(
    COLLECTION_KEYS.filter((key) => allowed(actor, key)).map(async (key) => {
      const own = key === "activity" && !actor.can("activity.view");
      // oldest first: the client puts newest-first collections in front in reverse
      const rows = await db.query(`SELECT * FROM ${tableName(key)} WHERE rev > $1${own ? " AND user_id = $2" : ""} ORDER BY seq`, own ? [since, actor.id] : [since]);
      if (rows.length) (patch.upsert as Record<string, unknown[]>)[key] = forActor(actor, key, toItems(key, rows));
    }),
  );
  for (const r of await db.query<{ collection: CollectionKey; id: string }>("SELECT collection, id FROM deleted_rows WHERE rev > $1", [since])) {
    if (!isCollection(r.collection) || !allowed(actor, r.collection)) continue;
    ((patch.remove as Record<string, string[]>)[r.collection] ??= []).push(r.id);
  }
  if (v.settings_rev > since) patch.settings = await readSettings(db);
  return { rev: v.rev, currentUserId: actor.id, patch };
}

/** What the public /book page needs to show availability and prices — no customer data. */
export async function loadBookingState() {
  const [zones, packages, addons, ratePlans, rules, settings, upcoming] = await Promise.all([
    readCollection(db, "zones"),
    readCollection(db, "packages"),
    readCollection(db, "addons"),
    readCollection(db, "ratePlans"),
    readCollection(db, "rules"),
    readSettings(db),
    db.query('SELECT id, ref, kind, mode, date, start, "end", kids, status FROM bookings WHERE date >= $1', [today()]),
  ]);
  return {
    zones: zones.filter((z) => z.active),
    packages: packages.filter((p) => p.active),
    addons: addons.filter((a) => a.active),
    ratePlans: ratePlans.filter((p) => p.active),
    rules,
    bookings: toItems("bookings", upcoming),
    settings: { businessName: settings.businessName, address: settings.address, phone: settings.phone, holidays: settings.holidays },
  };
}
