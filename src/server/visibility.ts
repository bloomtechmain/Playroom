import type { Actor } from "./auth";
import type { CollectionKey } from "./collections";

const omit = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** Fields a role may not see, removed from every row it's sent (full loads, changes and write responses). */
export function forActor(actor: Actor, key: CollectionKey, items: unknown[]): unknown[] {
  const rows = items as Record<string, unknown>[];
  if (key === "employees") {
    // badge tokens clock people in at the QR reader: only those who manage staff records see them
    const badge = actor.can("hr.edit");
    // working hours: only administrators and the owner
    const hours = actor.can("hr.hours");
    if (badge && hours) return items;
    return rows.map((e) => ({ ...(hours ? e : omit(e, ["workHours"])), ...(badge ? {} : { qrToken: "" }) }));
  }
  if (key === "attendance" && !actor.can("hr.hours")) return rows.map((a) => omit(a, ["scheduledIn", "inDiffMin", "punctuality"]));
  return items;
}
