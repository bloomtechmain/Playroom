import type { PrintBlock } from "./printAgent";
import { bookingQr } from "./booking";
import { useStore } from "./store";
import type { Booking, Sale, Shift, Ticket } from "./types";
import { shiftSummary } from "./shift";
import { CREDIT, CREDIT_PHONE } from "./credit";
import { stayMinutes } from "./pricing";
import { fmtDate, fmtDT, fmtTime, methodLabel, minsToLabel } from "./utils";

// Print Agent versions of the receipts in components/Receipts.tsx — keep the two in step.

const n = (v: number) => Math.round(v).toLocaleString("en-LK");
const first = (name?: string) => name?.split(" ")[0] ?? "";
const row = (left: string, right: string | number | undefined, bold?: boolean): PrintBlock => ({ type: "row", left, right: String(right ?? ""), bold });
const hr: PrintBlock = { type: "hr" };
const center = (text: string, extra: Partial<Extract<PrintBlock, { type: "text" }>> = {}): PrintBlock => ({ type: "text", text, align: "center", ...extra });
/** Last lines of every customer receipt. */
const credit = (): PrintBlock[] => [center(CREDIT), center(CREDIT_PHONE)];

function head(): PrintBlock[] {
  const s = useStore.getState().settings;
  return [center(s.businessName, { bold: true, size: 2 }), center("PLAY · GROW · SHINE"), center(s.address), center(s.phone), hr];
}

export function entryTicketDoc(t: Ticket, copy?: boolean): PrintBlock[] {
  const s = useStore.getState().settings;
  return [
    center(s.businessName, { bold: true, size: 2 }),
    ...(copy ? [center(`** COPY ${t.reprints} **`, { bold: true })] : []),
    { type: "feed", lines: 1 },
    { type: "qr", data: t.code, size: 8 },
    center(t.code),
    hr,
    center("IN"),
    center(fmtTime(t.checkIn), { bold: true, size: 2 }),
    center(fmtDate(t.checkIn)),
  ];
}

export function ticketDoc(tickets: Ticket[], copy?: boolean): PrintBlock[] {
  const st = useStore.getState();
  const t = tickets[0];
  const c = st.customers.find((x) => x.id === t.customerId);
  const kids = st.children.filter((k) => tickets.some((x) => x.childIds.includes(k.id)));
  const out: PrintBlock[] = [...head()];
  if (copy) out.push(center(`** REPRINT - COPY ${t.reprints} **`, { bold: true }));
  out.push(center("VISIT RECEIPT", { bold: true }), { type: "qr", data: t.visitId ?? t.code, size: 7 }, center(t.visitId ?? t.code, { bold: true }), hr, row("Guardian", c?.name));
  if (kids.length) out.push(row("Kids", kids.map((k) => first(k.name)).join(", ")));
  out.push(row("In", fmtDT(t.checkIn)));
  if (t.checkOut) out.push(row("Out", fmtTime(t.checkOut)));
  out.push(row("Time spent", minsToLabel(stayMinutes(t)), true));
  for (const x of tickets) {
    const z = st.zones.find((y) => y.id === x.zoneId);
    const pr = st.promotions.find((y) => y.id === x.promoId);
    out.push(hr, { type: "text", text: `${z?.name ?? ""} · ${x.visitors}${z?.kind === "play" ? ` kid(s)${x.adults ? ` + ${x.adults} adult(s)` : ""}` : " person(s)"}`, bold: true });
    out.push(row(`Time x ${x.visitors}`, n(x.base)));
    if (x.ruleAdjust !== 0) out.push(row(x.ruleNames.join(", ") || "Rate rules", n(x.ruleAdjust)));
    if (x.overtimeFee > 0) out.push(row("Extra time", n(x.overtimeFee)));
    if (x.discount > 0) out.push(row(pr ? `Promo ${pr.code}` : "Discount", `-${n(x.discount)}`));
    if (x.loyaltyUsed > 0) out.push(row("Loyalty points", `-${n(x.loyaltyUsed)}`));
    if (tickets.length > 1) out.push(row("Subtotal", n(x.total)));
  }
  out.push(
    hr,
    row("TOTAL (LKR)", n(tickets.reduce((a, x) => a + x.total, 0)), true),
    row("Paid", n(tickets.reduce((a, x) => a + x.paid, 0))),
    hr,
    center(`Served by ${first(st.users.find((u) => u.id === t.createdBy)?.name)}`),
    center(st.settings.receiptFooter, { bold: true }),
    ...credit(),
  );
  return out;
}

export function saleDoc(s: Sale): PrintBlock[] {
  const st = useStore.getState();
  const out: PrintBlock[] = [
    ...head(),
    row("Receipt", s.no),
    row("Date", fmtDT(s.at)),
    row("Cashier", first(st.users.find((u) => u.id === s.userId)?.name)),
    hr,
  ];
  for (const i of s.items) out.push({ type: "text", text: i.name }, row(`  ${i.qty} x ${n(i.price)}`, n(i.qty * i.price)));
  out.push(hr, row("Subtotal", n(s.subtotal)));
  if (s.discount > 0) out.push(row("Discount", `-${n(s.discount)}`));
  out.push(row("TOTAL (LKR)", n(s.total), true), row(methodLabel[s.method], n(s.method === "cash" ? s.tendered : s.total)));
  if (s.method === "cash") out.push(row("Change", n(s.tendered - s.total)));
  out.push(hr, center(`Items: ${s.items.reduce((a, i) => a + i.qty, 0)}`), center(st.settings.receiptFooter, { bold: true }), ...credit());
  return out;
}

export function bookingDoc(b: Booking): PrintBlock[] {
  const st = useStore.getState();
  const c = st.customers.find((x) => x.id === b.customerId);
  const pk = st.packages.find((x) => x.id === b.packageId);
  const out: PrintBlock[] = [
    ...head(),
    center("BOOKING CONFIRMATION", { bold: true }),
    { type: "qr", data: bookingQr(b), size: 6 },
    center(b.ref, { bold: true }),
    hr,
    row("Name", c?.name),
    row("Type", b.kind === "party" ? `Party · ${b.mode === "full" ? "Full venue" : "Party room"}` : b.kind === "play" ? "Play visit" : "Co-work"),
  ];
  if (pk) out.push(row("Package", pk.name));
  out.push(row("Date", b.date), row("Time", `${b.start} - ${b.end}`), row("Guests", b.guests));
  if (b.theme) out.push(row("Theme", b.theme));
  out.push(hr, row("Total", n(b.total)), row("Paid", n(b.paid)), row("Balance due", n(b.total - b.paid), true), hr, ...credit());
  return out;
}

/** Shift-end slip (the on-screen version is ShiftReport in app/(app)/shifts/page.tsx). */
export function shiftDoc(sh: Shift): PrintBlock[] {
  const st = useStore.getState();
  const r = shiftSummary(sh, st.transactions);
  const out: PrintBlock[] = [
    center(st.settings.businessName, { bold: true, size: 2 }),
    center("SHIFT REPORT", { bold: true }),
    hr,
    row("Cashier", st.users.find((u) => u.id === sh.userId)?.name),
    row("Opened", fmtDT(sh.openedAt)),
    row("Closed", sh.closedAt ? fmtDT(sh.closedAt) : "OPEN"),
    hr,
    ...Object.entries(r.by).map(([k, v]) => row(methodLabel[k] ?? k, n(v))),
    row("Gross takings", n(r.total), true),
    row("Refunds", r.refunds ? `-${n(r.refunds)}` : "0"),
    row(`Discounts (${r.discountTx.length})`, n(r.discounts)),
    hr,
    row("Opening float", n(sh.openingFloat)),
    row("+ Cash sales", n(r.cashSales)),
    row("- Cash refunds", n(r.cashRefunds)),
    row("Expected cash", n(r.expected), true),
    row("Counted cash", sh.countedCash != null ? n(sh.countedCash) : "-"),
    row("VARIANCE", r.variance != null ? n(r.variance) : "-", true),
  ];
  if (sh.notes) out.push({ type: "text", text: `Note: ${sh.notes}` });
  if (r.discountTx.length) {
    out.push(hr, { type: "text", text: "Discount audit", bold: true });
    [...r.discountTx].sort((x, y) => x.at.localeCompare(y.at)).slice(0, 15).forEach((t) => out.push(row(`${fmtTime(t.at)} ${t.refLabel}`, n(t.discount))));
  }
  out.push(hr, row("Cashier signature", ""), { type: "feed", lines: 2 }, row("Checked by", ""));
  return out;
}
