import { localDay, type Range } from "./accounting";
import type { Booking, Sale, Ticket, Transaction, TxType, Zone } from "./types";

/**
 * Sales by part of the business: the café / POS, the playroom (play sessions and parties) and co-working.
 * Built from the payments themselves (each is tagged with its revenue stream; refunds name the stream they
 * reverse), so the units add up exactly to the combined figures. Cash basis, like the P&L.
 */

export type Stream = "pos" | "play" | "party" | "cowork";
export type Unit = "cafe" | "playroom" | "cowork";

export const STREAM_LABEL: Record<Stream, string> = { pos: "Café & POS sales", play: "Play sessions", party: "Parties", cowork: "Co-working" };
export const UNITS: { key: Unit; label: string; streams: Stream[] }[] = [
  { key: "cafe", label: "Café & POS", streams: ["pos"] },
  { key: "playroom", label: "Playroom", streams: ["play", "party"] },
  { key: "cowork", label: "Co-working", streams: ["cowork"] },
];

/** Extra time on older tickets is play revenue; party deposits are party revenue. Top-ups aren't sales. */
export function streamOf(t: TxType): Stream | undefined {
  if (t === "play" || t === "overtime") return "play";
  if (t === "party" || t === "deposit") return "party";
  if (t === "cowork" || t === "pos") return t;
  return undefined;
}

export interface StreamFigures {
  payments: number;
  gross: number;
  discounts: number;
  refunds: number;
  net: number;
  byMethod: Record<string, number>;
  /** yyyy-MM-dd → net */
  daily: Record<string, number>;
}

const empty = (): StreamFigures => ({ payments: 0, gross: 0, discounts: 0, refunds: 0, net: 0, byMethod: {}, daily: {} });
const inRange = (day: string, r: Range) => day >= r.from && day <= r.to;

export function streamFigures(txs: Transaction[], r: Range): Record<Stream, StreamFigures> {
  const out = { pos: empty(), play: empty(), party: empty(), cowork: empty() };
  for (const t of txs) {
    const day = localDay(t.at);
    if (!inRange(day, r)) continue;
    const s = streamOf(t.type === "refund" ? (t.revenueType ?? "refund") : t.type);
    if (!s) continue;
    const f = out[s];
    if (t.type === "refund") f.refunds += -t.amount;
    else {
      f.payments++;
      f.gross += t.amount;
      f.discounts += t.discount ?? 0;
      f.byMethod[t.method] = (f.byMethod[t.method] ?? 0) + t.amount;
    }
    f.net += t.amount;
    f.daily[day] = (f.daily[day] ?? 0) + t.amount;
  }
  return out;
}

/** Add streams together (a unit, or everything). */
export function combine(list: StreamFigures[]): StreamFigures {
  const c = empty();
  for (const f of list) {
    c.payments += f.payments;
    c.gross += f.gross;
    c.discounts += f.discounts;
    c.refunds += f.refunds;
    c.net += f.net;
    for (const [k, v] of Object.entries(f.byMethod)) c.byMethod[k] = (c.byMethod[k] ?? 0) + v;
    for (const [k, v] of Object.entries(f.daily)) c.daily[k] = (c.daily[k] ?? 0) + v;
  }
  return c;
}

/** Café: what was sold, what it cost and the margin, by category and by product. */
export function cafeFigures(sales: Sale[], categoryOf: (productId: string) => string, r: Range) {
  const inside = sales.filter((s) => inRange(localDay(s.at), r));
  const cats: Record<string, { qty: number; sales: number; cost: number }> = {};
  const products: Record<string, { name: string; category: string; qty: number; sales: number; cost: number }> = {};
  let cost = 0;
  for (const s of inside)
    for (const i of s.items) {
      const cat = categoryOf(i.productId) || "Other";
      const line = i.qty * i.price;
      const c = i.qty * i.cost;
      cost += c;
      const g = (cats[cat] ??= { qty: 0, sales: 0, cost: 0 });
      g.qty += i.qty;
      g.sales += line;
      g.cost += c;
      const p = (products[i.productId] ??= { name: i.name, category: cat, qty: 0, sales: 0, cost: 0 });
      p.qty += i.qty;
      p.sales += line;
      p.cost += c;
    }
  return {
    receipts: inside.length,
    items: inside.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty, 0), 0),
    /** cost of the goods sold */
    cost,
    categories: Object.entries(cats).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sales - a.sales),
    products: Object.values(products).sort((a, b) => b.sales - a.sales),
  };
}

/** Visits to the play area or co-working: how many, how many people, how long they stayed. */
export function visitFigures(tickets: Ticket[], zones: Zone[], kind: "play" | "cowork", r: Range) {
  const ids = new Set(zones.filter((z) => z.kind === kind).map((z) => z.id));
  const list = tickets.filter((t) => ids.has(t.zoneId) && t.status !== "cancelled" && inRange(localDay(t.checkIn), r));
  const done = list.filter((t) => t.checkOut);
  const minutes = done.reduce((a, t) => a + t.minutes, 0);
  return {
    visits: list.length,
    people: list.reduce((a, t) => a + t.visitors, 0),
    adults: list.reduce((a, t) => a + t.adults, 0),
    avgMinutes: done.length ? Math.round(minutes / done.length) : 0,
    hours: minutes / 60,
    byZone: [...ids].map((id) => ({ zone: zones.find((z) => z.id === id)?.name ?? "", visits: list.filter((t) => t.zoneId === id).length, people: list.filter((t) => t.zoneId === id).reduce((a, t) => a + t.visitors, 0) })),
  };
}

/** Parties held in the period (by party date), whatever was paid when. */
export function partyFigures(bookings: Booking[], r: Range) {
  const list = bookings.filter((b) => b.kind === "party" && b.status !== "cancelled" && inRange(b.date, r));
  return {
    parties: list.length,
    fullVenue: list.filter((b) => b.mode === "full").length,
    guests: list.reduce((a, b) => a + b.guests, 0),
    value: list.reduce((a, b) => a + b.total, 0),
    outstanding: list.reduce((a, b) => a + Math.max(0, b.total - b.paid), 0),
    overtime: list.reduce((a, b) => a + (b.overtimeCharge ?? 0), 0),
  };
}

/** Every day of the range, yyyy-MM-dd. */
export function daysOf(r: Range) {
  const out: string[] = [];
  for (let d = new Date(r.from + "T00:00"); ; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (k > r.to) break;
    out.push(k);
  }
  return out;
}
