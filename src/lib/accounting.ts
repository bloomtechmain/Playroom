import type { Expense, Sale, Settings, Transaction, TxType } from "./types";

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
  { key: "party", label: "Party bookings" },
  { key: "cowork", label: "Co-work lounge" },
  { key: "pos", label: "Café & merchandise (POS)" },
];

// ---------------------------------------------------------------- expense categories

/** Where an expense category is reported: a line of the P&L, or kept out of it. */
export type ExpenseSection = "cost_of_sales" | "staff" | "premises" | "selling" | "admin" | "finance" | "tax" | "inventory" | "capex" | "drawings";

export const EXPENSE_SECTIONS: { key: ExpenseSection; label: string; hint: string; pnl: boolean }[] = [
  { key: "cost_of_sales", label: "Cost of sales", hint: "Direct costs of what you sell, e.g. party food and supplies", pnl: true },
  { key: "staff", label: "Staff costs", hint: "Salaries, EPF/ETF, staff welfare", pnl: true },
  { key: "premises", label: "Premises costs", hint: "Rent, utilities, repairs and cleaning", pnl: true },
  { key: "selling", label: "Selling & marketing", hint: "Advertising, card and payment fees", pnl: true },
  { key: "admin", label: "Administrative & general", hint: "Office supplies, software, licences, other", pnl: true },
  { key: "finance", label: "Finance costs", hint: "Loan interest — shown after operating profit", pnl: true },
  { key: "tax", label: "Income tax", hint: "Tax on profit — shown after profit before tax", pnl: true },
  { key: "inventory", label: "Not in P&L — stock purchases", hint: "Shop stock reaches the P&L as cost of goods sold when it's sold", pnl: false },
  { key: "capex", label: "Not in P&L — equipment (capex)", hint: "Shown as investing in the cash flow statement", pnl: false },
  { key: "drawings", label: "Not in P&L — owner drawings", hint: "Shown as financing in the cash flow statement", pnl: false },
];
/** The groups of the "Operating expenses" block, in statement order. */
export const OPERATING_SECTIONS: ExpenseSection[] = ["staff", "premises", "selling", "admin"];
export const sectionLabel = (s: ExpenseSection) => EXPENSE_SECTIONS.find((x) => x.key === s)?.label ?? s;

export interface ExpenseCategoryDef {
  name: string;
  section: ExpenseSection;
  active: boolean;
  /** posted automatically (payroll, stock) — can't be renamed, hidden or moved */
  system?: boolean;
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { name: "Food & Party Supplies", section: "cost_of_sales", active: true },
  { name: "Salaries", section: "staff", active: true, system: true },
  { name: "EPF / ETF (Employer)", section: "staff", active: true, system: true },
  { name: "Rent", section: "premises", active: true },
  { name: "Utilities", section: "premises", active: true },
  { name: "Maintenance & Cleaning", section: "premises", active: true },
  { name: "Marketing", section: "selling", active: true },
  { name: "Bank & Card Fees", section: "selling", active: true },
  { name: "Supplies", section: "admin", active: true },
  { name: "Other", section: "admin", active: true },
  { name: "Loan Interest", section: "finance", active: true },
  { name: "Income Tax", section: "tax", active: true },
  { name: "Stock Purchases", section: "inventory", active: true, system: true },
  { name: "Equipment (Capex)", section: "capex", active: true },
  { name: "Owner Drawings", section: "drawings", active: true },
];

/** The venue's categories (the defaults until someone edits the list); system categories are always there. */
export function expenseCategories(settings: Pick<Settings, "expenseCategories"> | undefined): ExpenseCategoryDef[] {
  const list = settings?.expenseCategories?.length ? settings.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
  const missing = DEFAULT_EXPENSE_CATEGORIES.filter((d) => d.system && !list.some((c) => c.name === d.name));
  return [...list, ...missing];
}

/** An expense whose category isn't on the list (e.g. from an old backup) is reported as administrative. */
export const sectionOf = (cats: ExpenseCategoryDef[], name: string): ExpenseSection => cats.find((c) => c.name === name)?.section ?? "admin";

/** Checks an edited category list; returns a message for the first problem, or null. */
export function checkExpenseCategories(list: ExpenseCategoryDef[]): string | null {
  const seen = new Set<string>();
  for (const c of list) {
    const name = c.name?.trim();
    if (!name) return "Every category needs a name";
    if (seen.has(name.toLowerCase())) return `"${name}" is listed twice`;
    seen.add(name.toLowerCase());
    if (!EXPENSE_SECTIONS.some((s) => s.key === c.section)) return `Choose where "${name}" goes in the P&L`;
  }
  for (const d of DEFAULT_EXPENSE_CATEGORIES.filter((x) => x.system)) {
    const c = list.find((x) => x.name === d.name);
    if (!c || c.section !== d.section || !c.active) return `"${d.name}" is used automatically and can't be removed, hidden or moved`;
  }
  return null;
}

export function txInRange(txs: Transaction[], r: Range) {
  return txs.filter((t) => inRange(localDay(t.at), r));
}

type Amounts = Record<string, number>;
const sum = (m: Amounts) => Object.values(m).reduce((a, b) => a + b, 0);

/**
 * Cash-basis statement of profit or loss, in the standard order: revenue → cost of sales → gross profit →
 * operating expenses (by group) → operating profit → finance costs → profit before tax → income tax → net profit.
 * Deposits count as party revenue, wallet top-ups are a liability (excluded), wallet spend is revenue.
 * With a tax rate, income tax is estimated on the profit before tax and tax payments recorded as expenses
 * stay out of the P&L (they settle that liability and show in the cash flow); without one, those payments are the tax line.
 */
export function profitAndLoss(txs: Transaction[], sales: Sale[], expenses: Expense[], r: Range, cats: ExpenseCategoryDef[], taxPct = 0) {
  const t = txInRange(txs, r);
  const rev: Amounts = {};
  for (const l of REVENUE_LINES) rev[l.key] = 0;
  let refunds = 0;
  let discounts = 0;
  for (const x of t) {
    if (x.type === "topup") continue;
    if (x.type === "refund") {
      refunds += -x.amount;
      continue;
    }
    // older tickets recorded extra time separately; it is play-area revenue
    const k = x.type === "deposit" ? "party" : x.type === "overtime" ? "play" : x.type;
    rev[k] = (rev[k] ?? 0) + x.amount;
    discounts += x.discount ?? 0;
  }
  const grossRevenue = sum(rev);
  const netRevenue = grossRevenue - refunds;

  // POS goods are costed when sold (stock purchases stay out of the P&L)
  const cogs = sales
    .filter((s) => inRange(localDay(s.at), r))
    .reduce((a, s) => a + s.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
  const by: Partial<Record<ExpenseSection, Amounts>> = {};
  for (const e of expenses) {
    if (!inRange(e.date, r)) continue;
    const s = sectionOf(cats, e.category);
    (by[s] ??= {})[e.category] = (by[s]![e.category] ?? 0) + e.amount;
  }
  const costOfSales = by.cost_of_sales ?? {};
  const totalCostOfSales = cogs + sum(costOfSales);
  const grossProfit = netRevenue - totalCostOfSales;

  const opex = Object.fromEntries(OPERATING_SECTIONS.map((s) => [s, by[s] ?? {}])) as Record<ExpenseSection, Amounts>;
  const opexTotals = Object.fromEntries(OPERATING_SECTIONS.map((s) => [s, sum(opex[s])])) as Record<ExpenseSection, number>;
  const totalOpex = sum(opexTotals);
  const operatingProfit = grossProfit - totalOpex;
  const finance = by.finance ?? {};
  const totalFinance = sum(finance);
  const profitBeforeTax = operatingProfit - totalFinance;
  const taxPaid = sum(by.tax ?? {});
  const tax: Amounts = taxPct > 0 ? { [`Income tax (estimated at ${taxPct}%)`]: Math.round((Math.max(0, profitBeforeTax) * taxPct) / 100) } : (by.tax ?? {});
  const totalTax = sum(tax);
  const netProfit = profitBeforeTax - totalTax;
  return {
    rev, grossRevenue, refunds, discounts, netRevenue,
    cogs, costOfSales, totalCostOfSales, grossProfit,
    opex, opexTotals, totalOpex, operatingProfit,
    finance, totalFinance, profitBeforeTax, tax, totalTax, taxPaid, netProfit,
    margin: netRevenue ? netProfit / netRevenue : 0,
    grossMargin: netRevenue ? grossProfit / netRevenue : 0,
  };
}

/** Direct-method cash flow statement. */
export function cashFlow(txs: Transaction[], expenses: Expense[], r: Range, opening: number, cats: ExpenseCategoryDef[]) {
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
    const s = sectionOf(cats, e.category);
    if (s === "capex") investing += e.amount;
    else if (s === "drawings") financing += e.amount;
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

export function dailySeries(txs: Transaction[], expenses: Expense[], r: Range, cats: ExpenseCategoryDef[]) {
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
    if (row && !["capex", "drawings"].includes(sectionOf(cats, e.category))) row.expenses += e.amount;
  }
  return [...map.values()];
}

export { localDay };
