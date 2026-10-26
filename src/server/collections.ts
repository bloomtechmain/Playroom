import type { DB as Snapshot } from "@/lib/seed";
import type { Row, Sql } from "./db/pool";

/**
 * The columns of every table in database.sql, by client collection name.
 * Names are the camelCase properties of src/lib/types.ts; the column is the snake_case form.
 *   name?   nullable column (an absent value is stored as NULL)
 *   name*   jsonb column (sent as JSON text)
 * Columns not listed (seq) are internal and never leave the server.
 */
const SPEC = {
  roles: ["roles", "id name description permissions locked?"],
  users: ["users", "id name username email phone roleId active passwordHash mustChangePassword? lastLogin? createdAt employeeId?"],
  zones: ["zones", "id name kind capacity nearFullPct openTime closeTime minAge? maxAge? rules active color"],
  ratePlans: ["rate_plans", "id zoneId price active"],
  rules: ["price_rules", "id name kind days start end date? adjust value zoneIds active"],
  promotions: ["promotions", "id code name type value packageKids? validFrom validTo usageCap used auto active zoneIds targeting*"],
  customers: ["customers", "id name phone email address member points wallet notes whatsappOptOut createdAt"],
  children: ["children", "id guardianId name dob gender allergies"],
  tickets: [
    "tickets",
    "id code customerId childIds visitors adults zoneId ratePlanId? minutes visitId? checkIn checkOut? status base ruleAdjust ruleNames promoId? discount loyaltyUsed overtimeFee total paid createdBy reprints bookingId?",
  ],
  transactions: ["transactions", "id at type method amount ref refLabel customerId? shiftId? userId discount revenueType?"],
  products: ["products", "id name category sku price cost stock reorderAt active"],
  sales: ["sales", "id no at items* subtotal discount total method tendered userId shiftId? customerId? refunded?"],
  packages: ["party_packages", "id name roomZoneId guestLimit durationMin priceRoomOnly priceFullVenue extraGuestPrice depositPct includes active"],
  addons: ["addons", "id name kind price perHead active"],
  bookings: [
    "bookings",
    "id ref kind mode? customerId date start end zoneId packageId? guests kids addonIds theme notes total adjustment? deposit paid status source createdAt",
  ],
  shifts: ["shifts", "id userId openedAt closedAt? openingFloat countedCash? notes"],
  refunds: ["refunds", "id at target targetId label maxAmount amount full category? reason method requestedBy status decidedBy? decidedAt?"],
  expenses: ["expenses", "id date category description vendor amount paidFrom payrollRunId? createdBy"],
  employees: ["employees", "id code name designation phone nic joinDate basic allowances* deductions* otRate epf etf epfNo bank active qrToken color"],
  attendance: ["attendance", "id employeeId date clockIn clockOut? method"],
  payroll: ["payroll_runs", "id month status lines* createdAt paidAt? createdBy"],
  activity: ["activity", "id at userId module action detail before? after?"],
} as const;

export type CollectionKey = keyof typeof SPEC;
export type Collections = Pick<Snapshot, CollectionKey>;
export type Item<K extends CollectionKey> = Collections[K][number];

interface Col {
  key: string;
  column: string;
  nullable: boolean;
  json: boolean;
}
interface Table {
  name: string;
  cols: Col[];
  byColumn: Map<string, Col>;
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export const TABLES = Object.fromEntries(
  Object.entries(SPEC).map(([k, [name, spec]]) => {
    const cols = spec.split(/\s+/).map((tok) => {
      const key = tok.replace(/[?*]/g, "");
      return { key, column: snake(key), nullable: tok.includes("?"), json: tok.includes("*") };
    });
    return [k, { name, cols, byColumn: new Map(cols.map((c) => [c.column, c])) }];
  }),
) as Record<CollectionKey, Table>;

export const COLLECTION_KEYS = Object.keys(SPEC) as CollectionKey[];
export const isCollection = (k: string): k is CollectionKey => Object.hasOwn(SPEC, k);

/** Quote an identifier ("end", "full" and "start" are SQL keywords). */
export const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
export const tableName = (key: CollectionKey) => ident(TABLES[key].name);

/** Never sent to the browser. */
const PRIVATE = new Set(["passwordHash"]);

/** DB row → client object: camelCase keys, internal columns and NULLs dropped (the app uses optional fields). */
export function toItem<K extends CollectionKey>(key: K, row: Row): Item<K> {
  const t = TABLES[key];
  const out: Record<string, unknown> = {};
  for (const [column, v] of Object.entries(row)) {
    const col = t.byColumn.get(column);
    if (!col || v === null || v === undefined || PRIVATE.has(col.key)) continue;
    out[col.key] = v;
  }
  return out as unknown as Item<K>;
}

export const toItems = <K extends CollectionKey>(key: K, rows: Row[]) => rows.map((r) => toItem(key, r));

const param = (col: Col, v: unknown) => (col.json ? JSON.stringify(v) : v);

/**
 * Client object → columns and values for an INSERT. Absent optional fields become NULL (so an update
 * really clears them); absent required ones are left out and fall back to the column DEFAULT.
 */
function columnsOf(key: CollectionKey, item: Record<string, unknown>, extra: Record<string, unknown>) {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const col of TABLES[key].cols) {
    const v = col.key in extra ? extra[col.key] : item[col.key];
    if (v === undefined || v === null) {
      if (!col.nullable) continue;
      cols.push(col.column);
      vals.push(null);
    } else {
      cols.push(col.column);
      vals.push(param(col, v));
    }
  }
  return { cols, vals };
}

/** INSERT (or INSERT … ON CONFLICT (id) DO UPDATE) one record; returns the stored row. */
export async function insertRow(sql: Sql, key: CollectionKey, item: object, opts: { extra?: Record<string, unknown>; upsert?: boolean } = {}) {
  const { cols, vals } = columnsOf(key, item as Record<string, unknown>, opts.extra ?? {});
  let text = `INSERT INTO ${tableName(key)} (${cols.map(ident).join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")})`;
  if (opts.upsert) {
    const set = cols.filter((c) => c !== "id").map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`);
    text += set.length ? ` ON CONFLICT (id) DO UPDATE SET ${set.join(", ")}` : " ON CONFLICT (id) DO NOTHING";
  }
  return (await sql.one(`${text} RETURNING *`, vals))!;
}

/** UPDATE the given fields of one record (undefined/null clears an optional field). */
export async function updateRow(sql: Sql, key: CollectionKey, id: string, patch: Record<string, unknown>) {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const col of TABLES[key].cols) {
    if (col.key === "id" || !(col.key in patch)) continue;
    const v = patch[col.key];
    vals.push(v === undefined || v === null ? null : param(col, v));
    sets.push(`${ident(col.column)} = $${vals.length}`);
  }
  if (!sets.length) return sql.one(`SELECT * FROM ${tableName(key)} WHERE id = $1`, [id]);
  return sql.one(`UPDATE ${tableName(key)} SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals);
}

/** Multi-row INSERT for imports; missing required values use DEFAULT. */
export async function insertMany(sql: Sql, key: CollectionKey, items: Record<string, unknown>[], extra: (it: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  if (!items.length) return;
  const cols = TABLES[key].cols;
  const perChunk = Math.max(1, Math.floor(60000 / cols.length));
  for (let i = 0; i < items.length; i += perChunk) {
    const vals: unknown[] = [];
    const rows = items.slice(i, i + perChunk).map((item) => {
      const x = extra(item);
      const cells = cols.map((col) => {
        const v = col.key in x ? x[col.key] : item[col.key];
        if (v === undefined || v === null) {
          if (!col.nullable) return "DEFAULT";
          vals.push(null);
        } else vals.push(param(col, v));
        return `$${vals.length}`;
      });
      return `(${cells.join(", ")})`;
    });
    await sql.query(`INSERT INTO ${tableName(key)} (${cols.map((c) => ident(c.column)).join(", ")}) VALUES ${rows.join(", ")}`, vals);
  }
}
