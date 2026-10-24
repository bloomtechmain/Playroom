import type { Expense, Sale, Transaction, TxType } from "./types";

export interface Range {
  from: string; // yyyy-MM-dd inclusive
  to: string;
}

const inRange = (d: string, r: Range) => {
  const k = d.slice(0, 10);
  return k >= r.from && k <= r.to;
};
// transactions are stored in ISO (UTC); use local date for range checks
const localDay = (isoStr: string) => {
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const REVENUE_LINES: { key: TxType; label: string }[] = [
  { key: "play", label: "Play area sessions" },
  { key: "overtime", label: "Overtime fees" },
  { key: "party", label: "Party bookings" },
  { key: "cowork", label: "Co-work lounge" },
  { key: "pos", label: "Café & merchandise (POS)" },
];

const OPEX_EXCLUDED = ["Equipment (Capex)", "Owner Drawings", "Stock Purchases"];

export function txInRange(txs: Transaction[], r: Range) {
  return txs.filter((t) => inRange(localDay(t.at), r));
}

/** Cash-basis P&L. Deposits count as party revenue, wallet top-ups are a liability (excluded), wallet spend is revenue. */
export function profitAndLoss(txs: Transaction[], sales: Sale[], expenses: Expense[], r: Range) {
  const t = txInRange(txs, r);
  const rev: Record<string, number> = {};
  for (const l of REVENUE_LINES) rev[l.key] = 0;
  let refunds = 0;
  let discounts = 0;
  for (const x of t) {
    if (x.type === "topup") continue;
    if (x.type === "refund") {
      refunds += -x.amount;
      continue;
    }
    const k = x.type === "deposit" ? "party" : x.type;
    rev[k] = (rev[k] ?? 0) + x.amount;
    discounts += x.discount ?? 0;
  }
  const grossRevenue = Object.values(rev).reduce((a, b) => a + b, 0);
  const netRevenue = grossRevenue - refunds;
  const cogs = sales
    .filter((s) => inRange(localDay(s.at), r))
    .reduce((a, s) => a + s.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
  const grossProfit = netRevenue - cogs;
  const ex = expenses.filter((e) => inRange(e.date, r) && !OPEX_EXCLUDED.includes(e.category));
  const opex: Record<string, number> = {};
  for (const e of ex) opex[e.category] = (opex[e.category] ?? 0) + e.amount;
  const totalOpex = Object.values(opex).reduce((a, b) => a + b, 0);
  const netProfit = grossProfit - totalOpex;
  return { rev, grossRevenue, refunds, discounts, netRevenue, cogs, grossProfit, opex, totalOpex, netProfit, margin: netRevenue ? netProfit / netRevenue : 0 };
}

/** Direct-method cash flow statement. */
export function cashFlow(txs: Transaction[], expenses: Expense[], r: Range, opening: number) {
  const t = txInRange(txs, r);
  const inflow: Record<string, number> = {
    "Play area & co-work sessions": 0,
    "Party bookings & deposits": 0,
    "Café & merchandise sales": 0,
    "Customer wallet top-ups": 0,
  };
  let refunds = 0;
  const byMethod: Record<string, number> = {};
  for (const x of t) {
    if (x.method === "wallet") continue; // already received as a top-up
    byMethod[x.method] = (byMethod[x.method] ?? 0) + x.amount;
    if (x.type === "refund") refunds += -x.amount;
    else if (x.type === "play" || x.type === "cowork" || x.type === "overtime") inflow["Play area & co-work sessions"] += x.amount;
    else if (x.type === "party" || x.type === "deposit") inflow["Party bookings & deposits"] += x.amount;
    else if (x.type === "pos") inflow["Café & merchandise sales"] += x.amount;
    else if (x.type === "topup") inflow["Customer wallet top-ups"] += x.amount;
  }
  const ex = expenses.filter((e) => inRange(e.date, r));
  const opOut: Record<string, number> = {};
  let investing = 0;
  let financing = 0;
  for (const e of ex) {
    if (e.category === "Equipment (Capex)") investing += e.amount;
    else if (e.category === "Owner Drawings") financing += e.amount;
    else opOut[e.category] = (opOut[e.category] ?? 0) + e.amount;
  }
  const totalIn = Object.values(inflow).reduce((a, b) => a + b, 0);
  const totalOpOut = Object.values(opOut).reduce((a, b) => a + b, 0);
  const netOperating = totalIn - refunds - totalOpOut;
  const net = netOperating - investing - financing;
  return { inflow, totalIn, refunds, opOut, totalOpOut, netOperating, investing, financing, net, opening, closing: opening + net, byMethod };
}

/** Running cash balance before a date: opening balance in settings is as of the first recorded day. */
export function balanceBefore(txs: Transaction[], expenses: Expense[], date: string, opening: number) {
  let bal = opening;
  for (const x of txs) if (localDay(x.at) < date && x.method !== "wallet") bal += x.amount;
  for (const e of expenses) if (e.date < date) bal -= e.amount;
  return bal;
}

export function dailySeries(txs: Transaction[], expenses: Expense[], r: Range) {
  const map = new Map<string, { day: string; revenue: number; expenses: number }>();
  const start = new Date(r.from + "T00:00:00");
  const end = new Date(r.to + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = localDay(d.toISOString());
    map.set(k, { day: k, revenue: 0, expenses: 0 });
  }
  for (const x of txs) {
    if (x.type === "topup") continue;
    const k = localDay(x.at);
    const row = map.get(k);
    if (row) row.revenue += x.amount;
  }
  for (const e of expenses) {
    const row = map.get(e.date);
    if (row && !["Equipment (Capex)", "Owner Drawings"].includes(e.category)) row.expenses += e.amount;
  }
  return [...map.values()];
}

export { localDay };
