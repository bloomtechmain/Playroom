import "server-only";
import type { Collections } from "@/lib/patch";
import type { Settings } from "@/lib/types";
import { today } from "@/lib/utils";
import type { Actor } from "./auth";
import { COLLECTION_KEYS, toItems, type CollectionKey } from "./collections";
import { db } from "./db";
import { currentRev } from "./mutation";
import { readCollection, readSettings } from "./snapshot";

/** Sensitive collections are only sent to roles that have a screen for them. */
const NEEDS: Partial<Record<CollectionKey, string[]>> = {
  expenses: ["expenses.view", "reports.view", "dashboard.view", "payroll.view"],
  payroll: ["payroll.view"],
  employees: ["hr.view", "hr.edit", "payroll.view"],
  attendance: ["hr.view", "hr.edit", "payroll.view"],
};

export interface AppState {
  rev: number;
  currentUserId: string;
  data: Collections & { settings: Settings };
}

export async function loadState(actor: Actor): Promise<AppState> {
  const rev = await currentRev();
  const data = {} as Record<string, unknown>;
  await Promise.all(
    COLLECTION_KEYS.map(async (key) => {
      const need = NEEDS[key];
      if (need && !need.some((p) => actor.can(p))) return void (data[key] = []);
      if (key === "activity") {
        // the audit trail for those allowed to see it; everyone else gets their own recent entries (My profile)
        data[key] = actor.can("activity.view")
          ? await readCollection(db, "activity", { limit: 1500 })
          : toItems("activity", await db.query("SELECT * FROM activity WHERE user_id = $1 ORDER BY at DESC LIMIT 50", [actor.id]));
        return;
      }
      data[key] = await readCollection(db, key);
    }),
  );
  data.settings = await readSettings(db);
  return { rev, currentUserId: actor.id, data: data as AppState["data"] };
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

/** Staff clock-in tablet: names for today's scans. Badge tokens are never sent to the tablet. */
export async function loadKioskState() {
  const employees = toItems("employees", await db.query("SELECT id, name, active FROM employees WHERE active ORDER BY seq"));
  const attendance = toItems("attendance", await db.query("SELECT * FROM attendance WHERE date = $1", [today()]));
  return {
    employees: employees.map((e) => ({ ...e, qrToken: "" })),
    attendance,
  };
}
