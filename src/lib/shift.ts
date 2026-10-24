import type { Shift, Transaction } from "./types";

export function shiftSummary(sh: Shift, txs: Transaction[]) {
  const t = txs.filter((x) => x.shiftId === sh.id);
  const by: Record<string, number> = {};
  let refunds = 0;
  let cashRefunds = 0;
  let discounts = 0;
  let count = 0;
  for (const x of t) {
    if (x.amount < 0) {
      refunds += -x.amount;
      if (x.method === "cash") cashRefunds += -x.amount;
      continue;
    }
    count++;
    by[x.method] = (by[x.method] ?? 0) + x.amount;
    discounts += x.discount ?? 0;
  }
  const cashSales = by.cash ?? 0;
  const expected = sh.openingFloat + cashSales - cashRefunds;
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return { by, refunds, cashRefunds, discounts, count, cashSales, cardSales: by.card ?? 0, expected, total, variance: sh.countedCash != null ? sh.countedCash - expected : undefined, discountTx: t.filter((x) => x.discount > 0) };
}
