import "server-only";
import type { Patch } from "@/lib/patch";
import type { Settings, Shift, Transaction } from "@/lib/types";
import { uid } from "@/lib/utils";
import type { Actor } from "./auth";
import { db, transaction, type Row, type Sql } from "./db";
import { insertRow, tableName, toItem, toItems, updateRow, type CollectionKey, type Item } from "./collections";
import { notFound } from "./http";
import { commitRev, readVersion, type Changes } from "./rev";
import { readSettings, saveSettings } from "./snapshot";
import { forActor } from "./visibility";

const iso = () => new Date().toISOString();

/** Before → after summary for the audit log (same format as the demo). */
export function diff(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: string[] = [];
  for (const k of Object.keys(b)) {
    if (k === "password" || k === "passwordHash") continue;
    const x = a[k];
    const y = b[k];
    // secrets never go into the audit trail
    if (k === "qrToken") {
      if (x !== y) out.push("badge re-issued");
      continue;
    }
    // working hours and arrivals are for administrators only; the audit log is read more widely
    if (k === "scheduledIn" || k === "inDiffMin" || k === "punctuality") continue;
    if (k === "workHours") {
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push("working hours changed");
      continue;
    }
    if (typeof y === "object" || typeof x === "object") {
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${k} changed`);
    } else if (x !== y) out.push(`${k}: ${x ?? "—"} → ${y ?? "—"}`);
  }
  return out.join("; ");
}

/**
 * One database transaction on behalf of an actor. Every row it writes is collected into the
 * patch returned to the client; every audit entry is written to `activity` in the same transaction.
 */
export class Mut {
  private upserts = new Map<CollectionKey, Map<string, unknown>>();
  private removes = new Map<CollectionKey, Set<string>>();
  private settingsChanged = false;
  private reload = false;

  constructor(
    readonly tx: Sql,
    readonly actor: Actor,
  ) {}

  private touch<K extends CollectionKey>(key: K, row: Row | undefined): Item<K> {
    if (!row) throw notFound();
    const item = toItem(key, row);
    const id = (item as { id: string }).id;
    if (!this.upserts.has(key)) this.upserts.set(key, new Map());
    this.upserts.get(key)!.set(id, item);
    this.removes.get(key)?.delete(id);
    return item;
  }

  /** Serialise concurrent writers on a named resource (e.g. sequential ticket numbers). */
  async lock(name: string) {
    await this.tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [name]);
  }

  /** Run a SELECT and map the rows to client objects of a collection. */
  async rows<K extends CollectionKey>(key: K, text: string, params: unknown[] = []): Promise<Item<K>[]> {
    return toItems(key, await this.tx.query(text, params));
  }

  async find<K extends CollectionKey>(key: K, id: string, opts: { lock?: boolean } = {}): Promise<Item<K> | undefined> {
    const row = await this.tx.one(`SELECT * FROM ${tableName(key)} WHERE id = $1${opts.lock ? " FOR UPDATE" : ""}`, [id]);
    return row ? toItem(key, row) : undefined;
  }

  async get<K extends CollectionKey>(key: K, id: string, what?: string, opts: { lock?: boolean } = {}): Promise<Item<K>> {
    const it = await this.find(key, id, opts);
    if (!it) throw notFound(what);
    return it;
  }

  async insert<K extends CollectionKey>(key: K, item: Item<K>, extra: Record<string, unknown> = {}): Promise<Item<K>> {
    return this.touch(key, await insertRow(this.tx, key, item, { extra }));
  }

  /** Insert or fully replace a record. */
  async put<K extends CollectionKey>(key: K, item: Item<K>, extra: Record<string, unknown> = {}): Promise<Item<K>> {
    return this.touch(key, await insertRow(this.tx, key, item, { extra, upsert: true }));
  }

  /** Change some fields of a record (undefined clears an optional field). */
  async update<K extends CollectionKey>(key: K, id: string, patch: Partial<Item<K>> | Record<string, unknown>): Promise<Item<K>> {
    return this.touch(key, await updateRow(this.tx, key, id, patch as Record<string, unknown>));
  }

  async delete(key: CollectionKey, id: string) {
    await this.tx.query(`DELETE FROM ${tableName(key)} WHERE id = $1`, [id]);
    this.upserts.get(key)?.delete(id);
    if (!this.removes.has(key)) this.removes.set(key, new Set());
    this.removes.get(key)!.add(id);
  }

  async log(module: string, action: string, detail: string, before?: string, after?: string) {
    await this.insert("activity", { id: uid("ac"), at: iso(), userId: this.actor.id, module, action, detail: detail ?? "", before, after });
  }

  async settings(): Promise<Settings> {
    return readSettings(this.tx);
  }

  async saveSettings(data: Omit<Settings, "backups">) {
    await saveSettings(this.tx, data);
    this.settingsChanged = true;
  }

  markSettingsChanged() {
    this.settingsChanged = true;
  }

  /** Tell the client everything changed (restore / reset). */
  requestReload() {
    this.reload = true;
  }

  async myShift(): Promise<Shift | undefined> {
    const row = await this.tx.one("SELECT * FROM shifts WHERE user_id = $1 AND closed_at IS NULL LIMIT 1", [this.actor.id]);
    return row ? toItem("shifts", row) : undefined;
  }

  async addTx(t: Omit<Transaction, "id" | "at" | "userId" | "shiftId"> & { at?: string }) {
    const shift = this.actor.id === "system" ? undefined : await this.myShift();
    return this.insert("transactions", { ...t, at: t.at ?? iso(), id: uid("t"), userId: this.actor.id, shiftId: shift?.id });
  }

  /** What this transaction wrote, for the revision stamp. */
  changes(): Changes {
    return {
      upserts: Object.fromEntries([...this.upserts].map(([k, m]) => [k, m.keys()])),
      removes: Object.fromEntries([...this.removes].map(([k, ids]) => [k, ids])),
      settings: this.settingsChanged,
      reset: this.reload,
    };
  }

  async toPatch(rev: number): Promise<Patch> {
    if (this.reload) return { rev, reload: true };
    const patch: Patch = { rev, upsert: {}, remove: {} };
    for (const [k, m] of this.upserts) (patch.upsert as Record<string, unknown[]>)[k] = forActor(this.actor, k, [...m.values()]);
    for (const [k, ids] of this.removes) if (ids.size) (patch.remove as Record<string, string[]>)[k] = [...ids];
    if (this.settingsChanged) patch.settings = await readSettings(this.tx);
    return patch;
  }
}

/** Run `fn` in a transaction; bumps the shared revision so other open screens refresh. */
export async function mutate<T>(actor: Actor, fn: (m: Mut) => Promise<T>): Promise<{ patch: Patch; result: T }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await transaction(async (sql) => {
        const m = new Mut(sql, actor);
        const result = await fn(m);
        const rev = await commitRev(sql, m.changes());
        return { patch: await m.toPatch(rev), result };
      });
    } catch (e) {
      // two writes waiting on each other (e.g. a restore while the till is busy): Postgres cancels one —
      // everything it did was rolled back, so run it again
      if ((e as { code?: string })?.code !== "40P01" || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
}

export async function currentRev() {
  return (await readVersion(db)).rev;
}
