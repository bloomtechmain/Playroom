"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { differenceInCalendarDays, endOfMonth, format, startOfMonth, startOfQuarter, subDays, subMonths } from "date-fns";
import { Download, FileText } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore, useCan } from "@/lib/store";
import { useNewReport } from "@/lib/useNewReport";
import type { StatementRow } from "@/lib/reportPdf";

const count = (n: number) => (n ? n.toLocaleString("en-US") : "-");
const num = (n: number) => n.toLocaleString("en-US");
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
import { balanceBefore, cashFlow, expenseCategories, localDay, OPERATING_SECTIONS, profitAndLoss, REVENUE_LINES, sectionLabel, txInRange, type Range } from "@/lib/accounting";
import { cx, downloadCSV, methodLabel, minsToLabel, money, shortMoney, today } from "@/lib/utils";
import { Button, Card, Input, NoAccess, PageHeader, Select, Stat, Table, Tabs, toast } from "@/components/ui";

const C = { sky: "#93bfea", rose: "#f29cae", mint: "#8bd4bd", sun: "#ffd56b", lilac: "#b9a3dc", teal: "#63c1ca", navy: "#35609f" };
const tip = { contentStyle: { borderRadius: 12, border: "1px solid #ebe5da", fontSize: 12 } };
const axis = { tick: { fontSize: 11, fill: "#8a92a5" }, tickLine: false, axisLine: false };
const D = (d: Date) => format(d, "yyyy-MM-dd");

type Preset = "month" | "last" | "30" | "quarter" | "custom";
/** The open tab's "make the PDF" function, called by the Download PDF button. */
type PdfRef = RefObject<(() => Promise<void>) | null>;

const longPeriod = (r: Range) => `${format(new Date(r.from + "T00:00"), "d MMMM yyyy")} to ${format(new Date(r.to + "T00:00"), "d MMMM yyyy")}`;
const shortPeriod = (r: Range) => {
  const f = new Date(r.from + "T00:00");
  const t = new Date(r.to + "T00:00");
  return f.getFullYear() === t.getFullYear() ? `${format(f, "d MMM")} - ${format(t, "d MMM yyyy")}` : `${format(f, "d MMM yyyy")} - ${format(t, "d MMM yyyy")}`;
};
const fileRange = (r: Range) => `${r.from}_to_${r.to}`;

/** Registers this tab's PDF builder with the page's Download PDF button. */
function usePdf(pdfRef: PdfRef, build: () => Promise<void>) {
  useEffect(() => {
    pdfRef.current = build;
  });
}

export default function ReportsPage() {
  const can = useCan();
  if (!can("reports.view")) return <NoAccess what="reports" />;
  return <Inner />;
}

function Inner() {
  const [tab, setTab] = useState<"pl" | "cf" | "sales" | "occ" | "loyalty" | "party">("pl");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(D(startOfMonth(new Date())));
  const [to, setTo] = useState(today());
  const pdf = useRef<(() => Promise<void>) | null>(null);
  const [making, setMaking] = useState(false);
  const downloadPdf = async () => {
    if (!pdf.current || making) return;
    setMaking(true);
    try {
      await pdf.current();
    } catch (e) {
      console.error(e);
      toast("Couldn't create the PDF", "err");
    }
    setMaking(false);
  };

  const range: Range = useMemo(() => {
    const n = new Date();
    if (preset === "month") return { from: D(startOfMonth(n)), to: D(n) };
    if (preset === "last") return { from: D(startOfMonth(subMonths(n, 1))), to: D(endOfMonth(subMonths(n, 1))) };
    if (preset === "30") return { from: D(subDays(n, 29)), to: D(n) };
    if (preset === "quarter") return { from: D(startOfQuarter(n)), to: D(n) };
    return { from, to };
  }, [preset, from, to]);
  const prev: Range = useMemo(() => {
    const days = differenceInCalendarDays(new Date(range.to), new Date(range.from)) + 1;
    if (preset === "month" || preset === "last") {
      const s = subMonths(new Date(range.from + "T00:00"), 1);
      return { from: D(s), to: D(preset === "month" ? subMonths(new Date(range.to + "T00:00"), 1) : endOfMonth(s)) };
    }
    return { from: D(subDays(new Date(range.from + "T00:00"), days)), to: D(subDays(new Date(range.from + "T00:00"), 1)) };
  }, [range, preset]);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${format(new Date(range.from + "T00:00"), "d MMM yyyy")} – ${format(new Date(range.to + "T00:00"), "d MMM yyyy")} · compared with ${format(new Date(prev.from + "T00:00"), "d MMM")} – ${format(new Date(prev.to + "T00:00"), "d MMM")}`}
        actions={
          <>
            <Select className="w-44" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="month">This month</option>
              <option value="last">Last month</option>
              <option value="30">Last 30 days</option>
              <option value="quarter">Quarter to date</option>
              <option value="custom">Custom range</option>
            </Select>
            {preset === "custom" && (
              <>
                <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
            <Button variant="secondary" icon={<FileText size={15} />} disabled={making} onClick={downloadPdf}>{making ? "Preparing…" : "Download PDF"}</Button>
          </>
        }
      />
      <div className="mb-5 no-print">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "pl", label: "Profit & Loss" },
            { value: "cf", label: "Cash Flow" },
            { value: "sales", label: "Sales" },
            { value: "occ", label: "Occupancy" },
            { value: "loyalty", label: "Loyalty & Promotions" },
            { value: "party", label: "Parties" },
          ]}
        />
      </div>
      <div className="print-area w-full">
        {tab === "pl" && <PL range={range} prev={prev} pdf={pdf} />}
        {tab === "cf" && <CF range={range} prev={prev} pdf={pdf} />}
        {tab === "sales" && <Sales range={range} pdf={pdf} />}
        {tab === "occ" && <Occupancy range={range} pdf={pdf} />}
        {tab === "loyalty" && <Loyalty range={range} pdf={pdf} />}
        {tab === "party" && <Parties range={range} pdf={pdf} />}
      </div>
    </>
  );
}

function pct(a: number, b: number) {
  if (!b) return "—";
  const v = ((a - b) / Math.abs(b)) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function StRow({ label, a, b, bold, indent, neg, total }: { label: string; a: number; b: number; bold?: boolean; indent?: boolean | 2; neg?: boolean; total?: boolean }) {
  const show = (v: number) => (neg ? `(${money(v, false)})` : money(v, false));
  return (
    <tr className={cx(total && "bg-[#faf7f1]", bold && "font-bold")}>
      <td className={cx(indent === 2 ? "!pl-16 text-muted" : indent && "!pl-10", total && "font-display text-[15px]")}>{label}</td>
      <td className={cx("text-right tabular", indent === 2 && "text-muted")}>{show(a)}</td>
      <td className="text-right tabular text-muted">{show(b)}</td>
      <td className={cx("text-right tabular text-xs", a >= b ? "text-[#2f8f72]" : "text-[#c24f69]", neg && (a >= b ? "!text-[#c24f69]" : "!text-[#2f8f72]"))}>{pct(a, b)}</td>
    </tr>
  );
}
const Section = ({ t }: { t: string }) => (
  <tr>
    <td colSpan={4} className="!pt-5 text-xs font-extrabold uppercase tracking-wider text-muted">{t}</td>
  </tr>
);

/** Category names that have an amount in either period, largest first. */
const namesOf = (a: Record<string, number>, b: Record<string, number>) => Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort((x, y) => (a[y] ?? 0) - (a[x] ?? 0));

function PL({ range, prev, pdf }: { range: Range; prev: Range; pdf: PdfRef }) {
  const tx = useStore((s) => s.transactions);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const settings = useStore((s) => s.settings);
  const cats = useMemo(() => expenseCategories(settings), [settings]);
  const taxPct = settings.incomeTaxPct ?? 0;
  const a = useMemo(() => profitAndLoss(tx, sales, expenses, range, cats, taxPct), [tx, sales, expenses, range, cats, taxPct]);
  const b = useMemo(() => profitAndLoss(tx, sales, expenses, prev, cats, taxPct), [tx, sales, expenses, prev, cats, taxPct]);
  const cos = namesOf(a.costOfSales, b.costOfSales);
  const groups = OPERATING_SECTIONS.map((s) => ({ s, label: sectionLabel(s), names: namesOf(a.opex[s], b.opex[s]) })).filter((g) => g.names.length);
  const fin = namesOf(a.finance, b.finance);
  const taxes = namesOf(a.tax, b.tax);
  const split = groups.flatMap((g) => g.names.map((n) => ({ n, v: a.opex[g.s][n] ?? 0 }))).sort((x, y) => y.v - x.v);

  const exportCsv = () =>
    downloadCSV(`profit-and-loss_${range.from}_${range.to}.csv`, [
      ["Line", "This period", "Previous"],
      ["Revenue", "", ""],
      ...REVENUE_LINES.map((l) => [l.label, a.rev[l.key], b.rev[l.key]]),
      ["Less: refunds", -a.refunds, -b.refunds],
      ["Net revenue", a.netRevenue, b.netRevenue],
      ["Cost of sales", "", ""],
      ["Café & merchandise — cost of goods sold", -a.cogs, -b.cogs],
      ...cos.map((c) => [c, -(a.costOfSales[c] ?? 0), -(b.costOfSales[c] ?? 0)]),
      ["Total cost of sales", -a.totalCostOfSales, -b.totalCostOfSales],
      ["Gross profit", a.grossProfit, b.grossProfit],
      ["Operating expenses", "", ""],
      ...groups.flatMap((g) => [[g.label, -a.opexTotals[g.s], -b.opexTotals[g.s]], ...g.names.map((c) => [`  ${c}`, -(a.opex[g.s][c] ?? 0), -(b.opex[g.s][c] ?? 0)])]),
      ["Total operating expenses", -a.totalOpex, -b.totalOpex],
      ["Operating profit", a.operatingProfit, b.operatingProfit],
      ...fin.map((c) => [c, -(a.finance[c] ?? 0), -(b.finance[c] ?? 0)]),
      ["Profit before tax", a.profitBeforeTax, b.profitBeforeTax],
      ...taxes.map((c) => [c, -(a.tax[c] ?? 0), -(b.tax[c] ?? 0)]),
      ["Net profit for the period", a.netProfit, b.netProfit],
    ]);

  const newReport = useNewReport();
  usePdf(pdf, async () => {
    const r = await newReport("Statement of profit or loss", longPeriod(range));
    r.kpis([
      { label: "Net revenue", value: money(a.netRevenue) },
      { label: `Gross profit (${(a.grossMargin * 100).toFixed(1)}%)`, value: money(a.grossProfit) },
      { label: "Operating profit", value: money(a.operatingProfit) },
      { label: `Net profit (${(a.margin * 100).toFixed(1)}%)`, value: money(a.netProfit) },
    ]);
    const two = (x: number, y: number) => [x, y];
    const rows: StatementRow[] = [
      { kind: "section", label: "Revenue" },
      ...REVENUE_LINES.map((l): StatementRow => ({ kind: "line", label: l.label, values: two(a.rev[l.key], b.rev[l.key]) })),
      ...(a.refunds || b.refunds ? [{ kind: "line", label: "Less: refunds", values: two(a.refunds, b.refunds), neg: true } as StatementRow] : []),
      { kind: "subtotal", label: "Net revenue", values: two(a.netRevenue, b.netRevenue) },
      { kind: "section", label: "Cost of sales" },
      { kind: "line", label: "Café & merchandise — cost of goods sold", values: two(a.cogs, b.cogs), neg: true },
      ...cos.map((c): StatementRow => ({ kind: "line", label: c, values: two(a.costOfSales[c] ?? 0, b.costOfSales[c] ?? 0), neg: true })),
      { kind: "subtotal", label: "Total cost of sales", values: two(a.totalCostOfSales, b.totalCostOfSales), neg: true },
      { kind: "total", label: "Gross profit", values: two(a.grossProfit, b.grossProfit) },
      { kind: "section", label: "Operating expenses" },
      ...groups.flatMap((g): StatementRow[] => [
        { kind: "line", label: g.label, values: two(a.opexTotals[g.s], b.opexTotals[g.s]), neg: true },
        ...g.names.map((c): StatementRow => ({ kind: "subline", label: c, values: two(a.opex[g.s][c] ?? 0, b.opex[g.s][c] ?? 0), neg: true })),
      ]),
      { kind: "subtotal", label: "Total operating expenses", values: two(a.totalOpex, b.totalOpex), neg: true },
      { kind: "total", label: "Operating profit", values: two(a.operatingProfit, b.operatingProfit) },
      ...(fin.length ? [{ kind: "section", label: "Finance costs" } as StatementRow, ...fin.map((c): StatementRow => ({ kind: "line", label: c, values: two(a.finance[c] ?? 0, b.finance[c] ?? 0), neg: true }))] : []),
      { kind: "total", label: "Profit before tax", values: two(a.profitBeforeTax, b.profitBeforeTax) },
      ...taxes.map((c): StatementRow => ({ kind: "line", label: c, values: two(a.tax[c] ?? 0, b.tax[c] ?? 0), neg: true })),
      { kind: "grand", label: "Net profit for the period", values: two(a.netProfit, b.netProfit) },
    ];
    r.statement([shortPeriod(range), shortPeriod(prev)], rows);
    r.heading("Notes");
    r.paragraph(`1. Basis of preparation: cash basis. Party deposits are recognised when received; customer wallet top-ups are balances owed to customers until spent. All amounts are in Sri Lankan rupees.`);
    r.paragraph(`2. Expenses are grouped by the P&L section of their category. Stock purchases reach the P&L as cost of goods sold when the stock is sold; equipment purchases and owner drawings are shown only in the statement of cash flows.`);
    r.paragraph(`3. Income tax: ${taxPct > 0 ? `estimated at ${taxPct}% of profit before tax (no tax on a loss)${a.taxPaid ? `; tax paid in the period, ${money(a.taxPaid)}, is in the statement of cash flows` : ""}.` : "tax payments recorded as expenses in the period; no rate is set for an estimate."}`);
    r.paragraph(`4. Promotional discounts given in the period: ${money(a.discounts)} (already deducted from revenue).`);
    r.signatures(["Prepared by", "Reviewed and approved by"]);
    r.save(`profit-and-loss_${fileRange(range)}`);
  });

  const pie = REVENUE_LINES.map((l, i) => ({ name: l.label, value: a.rev[l.key], fill: [C.sky, C.lilac, C.mint, C.sun][i] })).filter((x) => x.value > 0);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net revenue" value={shortMoney(a.netRevenue)} sub={`${pct(a.netRevenue, b.netRevenue)} vs previous`} tone="sky" />
        <Stat label="Gross profit" value={shortMoney(a.grossProfit)} sub={`${(a.grossMargin * 100).toFixed(1)}% gross margin`} tone="mint" />
        <Stat label="Operating profit" value={<span className={a.operatingProfit < 0 ? "text-[#c24f69]" : ""}>{shortMoney(a.operatingProfit)}</span>} sub={`after ${shortMoney(a.totalOpex)} operating expenses`} tone="rose" />
        <Stat label="Net profit" value={<span className={a.netProfit < 0 ? "text-[#c24f69]" : ""}>{shortMoney(a.netProfit)}</span>} sub={`${(a.margin * 100).toFixed(1)}% net margin`} tone="sun" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card pad={false} title="Statement of profit or loss" action={<Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={exportCsv}>CSV</Button>}>
          <Table head={["", "This period (Rs.)", "Previous", "Change"]}>
            <Section t="Revenue" />
            {REVENUE_LINES.map((l) => <StRow key={l.key} label={l.label} a={a.rev[l.key]} b={b.rev[l.key]} indent />)}
            {(a.refunds > 0 || b.refunds > 0) && <StRow label="Less: refunds" a={a.refunds} b={b.refunds} indent neg />}
            <StRow label="Net revenue" a={a.netRevenue} b={b.netRevenue} bold total />
            <Section t="Cost of sales" />
            <StRow label="Café & merchandise — cost of goods sold" a={a.cogs} b={b.cogs} indent neg />
            {cos.map((c) => <StRow key={c} label={c} a={a.costOfSales[c] ?? 0} b={b.costOfSales[c] ?? 0} indent neg />)}
            <StRow label="Total cost of sales" a={a.totalCostOfSales} b={b.totalCostOfSales} bold neg />
            <StRow label="Gross profit" a={a.grossProfit} b={b.grossProfit} bold total />
            <Section t="Operating expenses" />
            {groups.map((g) => (
              <Fragment key={g.s}>
                <StRow label={g.label} a={a.opexTotals[g.s]} b={b.opexTotals[g.s]} indent neg />
                {g.names.map((c) => <StRow key={c} label={c} a={a.opex[g.s][c] ?? 0} b={b.opex[g.s][c] ?? 0} indent={2} neg />)}
              </Fragment>
            ))}
            {!groups.length && <tr><td colSpan={4} className="!pl-10 text-sm text-muted">No operating expenses in this period.</td></tr>}
            <StRow label="Total operating expenses" a={a.totalOpex} b={b.totalOpex} bold neg />
            <StRow label="Operating profit" a={a.operatingProfit} b={b.operatingProfit} bold total />
            {fin.length > 0 && (
              <>
                <Section t="Finance costs" />
                {fin.map((c) => <StRow key={c} label={c} a={a.finance[c] ?? 0} b={b.finance[c] ?? 0} indent neg />)}
              </>
            )}
            <StRow label="Profit before tax" a={a.profitBeforeTax} b={b.profitBeforeTax} bold total />
            {taxes.map((c) => <StRow key={c} label={c} a={a.tax[c] ?? 0} b={b.tax[c] ?? 0} indent neg />)}
            {!taxes.length && <tr><td colSpan={4} className="!pl-10 text-sm text-muted">Income tax — no rate set (<Link href="/settings" className="font-bold text-navy hover:underline">Settings → Income tax rate</Link>) and no tax payments recorded.</td></tr>}
            <StRow label="Net profit for the period" a={a.netProfit} b={b.netProfit} bold total />
          </Table>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Cash basis. Party deposits are recognised when received. Wallet top-ups are customer balances (not revenue) until spent. Each expense category is placed by its P&amp;L section (set under Expenses → Categories); stock purchases reach the P&amp;L as cost of goods sold, and equipment and owner drawings appear only in the cash flow statement. {taxPct > 0 ? `Income tax is estimated at ${taxPct}% of profit before tax (no tax on a loss)${a.taxPaid ? `; tax actually paid in this period (${money(a.taxPaid)}) is in the cash flow statement` : ""}. ` : "Income tax shows tax payments recorded as expenses; set a rate in Settings to estimate it instead. "}Promotional discounts given: {money(a.discounts)}.
          </p>
        </Card>
        <div className="space-y-5">
          <Card title="Where revenue came from">
            <div className="h-[220px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
                    {pie.map((p) => <Cell key={p.name} fill={p.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} {...tip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {pie.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.fill }} />{p.name}</span>
                  <span className="tabular text-muted">{((p.value / a.grossRevenue) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Operating expense split">
            {split.slice(0, 8).map(({ n, v }) => (
              <div key={n} className="mb-2">
                <div className="flex justify-between text-sm"><span>{n}</span><span className="tabular text-muted">{money(v)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-[#f1ece3]"><div className="h-1.5 rounded-full bg-rose" style={{ width: `${(v / (a.totalOpex || 1)) * 100}%` }} /></div>
              </div>
            ))}
            {!split.length && <p className="text-sm text-muted">No operating expenses in this period.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

function CF({ range, prev, pdf }: { range: Range; prev: Range; pdf: PdfRef }) {
  const tx = useStore((s) => s.transactions);
  const expenses = useStore((s) => s.expenses);
  const settings = useStore((s) => s.settings);
  const openA = balanceBefore(tx, expenses, range.from, settings.openingCash);
  const openB = balanceBefore(tx, expenses, prev.from, settings.openingCash);
  const cats = useMemo(() => expenseCategories(settings), [settings]);
  const a = useMemo(() => cashFlow(tx, expenses, range, openA, cats), [tx, expenses, range, openA, cats]);
  const b = useMemo(() => cashFlow(tx, expenses, prev, openB, cats), [tx, expenses, prev, openB, cats]);
  const outCats = Array.from(new Set([...Object.keys(a.opOut), ...Object.keys(b.opOut)])).sort((x, y) => (a.opOut[y] ?? 0) - (a.opOut[x] ?? 0));

  const daily = useMemo(() => {
    const rows: { day: string; in: number; out: number; balance: number }[] = [];
    let bal = openA;
    for (let d = new Date(range.from + "T00:00"); D(d) <= range.to; d.setDate(d.getDate() + 1)) {
      const k = D(d);
      const inn = tx.filter((t) => t.method !== "wallet" && localDay(t.at) === k).reduce((s, t) => s + t.amount, 0);
      const out = expenses.filter((e) => e.date === k).reduce((s, e) => s + e.amount, 0);
      bal += inn - out;
      rows.push({ day: format(new Date(d), "d MMM"), in: inn, out: -out, balance: bal });
    }
    return rows;
  }, [tx, expenses, range, openA]);

  const exportCsv = () =>
    downloadCSV(`cash-flow_${range.from}_${range.to}.csv`, [
      ["Line", "Current", "Previous"],
      ["Opening cash & bank", a.opening, b.opening],
      ...Object.keys(a.inflow).map((k) => [k, a.inflow[k], b.inflow[k]]),
      ["Refunds paid", -a.refunds, -b.refunds],
      ...outCats.map((c) => [c, -(a.opOut[c] ?? 0), -(b.opOut[c] ?? 0)]),
      ["Net cash from operating activities", a.netOperating, b.netOperating],
      ["Equipment purchases", -a.investing, -b.investing],
      ["Owner drawings", -a.financing, -b.financing],
      ["Net change in cash", a.net, b.net],
      ["Closing cash & bank", a.closing, b.closing],
    ]);

  const newReport = useNewReport();
  usePdf(pdf, async () => {
    const r = await newReport("Statement of cash flows", longPeriod(range));
    r.kpis([
      { label: "Opening cash & bank", value: money(a.opening) },
      { label: "Cash in", value: money(a.totalIn) },
      { label: "Cash out", value: money(a.totalOpOut + a.refunds + a.investing + a.financing) },
      { label: "Closing cash & bank", value: money(a.closing) },
    ]);
    const two = (x: number, y: number) => [x, y];
    r.statement([shortPeriod(range), shortPeriod(prev)], [
      { kind: "total", label: "Opening cash and bank balance", values: two(a.opening, b.opening) },
      { kind: "section", label: "Cash flows from operating activities" },
      ...Object.keys(a.inflow).map((k): StatementRow => ({ kind: "line", label: `Received: ${k}`, values: two(a.inflow[k], b.inflow[k]) })),
      { kind: "subtotal", label: "Total cash received", values: two(a.totalIn, b.totalIn) },
      { kind: "line", label: "Refunds paid to customers", values: two(a.refunds, b.refunds), neg: true },
      ...outCats.map((c): StatementRow => ({ kind: "line", label: `Paid: ${c}`, values: two(a.opOut[c] ?? 0, b.opOut[c] ?? 0), neg: true })),
      { kind: "total", label: "Net cash from operating activities", values: two(a.netOperating, b.netOperating) },
      { kind: "section", label: "Cash flows from investing activities" },
      { kind: "line", label: "Purchase of equipment and fit-out", values: two(a.investing, b.investing), neg: true },
      { kind: "section", label: "Cash flows from financing activities" },
      { kind: "line", label: "Owner drawings", values: two(a.financing, b.financing), neg: true },
      { kind: "subtotal", label: "Net increase / (decrease) in cash", values: two(a.net, b.net) },
      { kind: "grand", label: "Closing cash and bank balance", values: two(a.closing, b.closing) },
    ]);
    r.heading("Receipts by payment method");
    const methods = Object.entries(a.byMethod).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    r.table(["Payment method", "Amount (Rs.)", "Share"], methods.map(([k, v]) => [methodLabel[k] ?? k, v, a.totalIn ? `${((v / a.totalIn) * 100).toFixed(1)}%` : "-"]), {
      align: ["l", "r", "r"],
      foot: ["Total", methods.reduce((t, [, v]) => t + v, 0), ""],
    });
    r.paragraph("Direct method. Wallet spending is excluded from receipts because the cash arrived when the wallet was topped up. Amounts in Sri Lankan rupees.");
    r.signatures(["Prepared by", "Reviewed and approved by"]);
    r.save(`cash-flow_${fileRange(range)}`);
  });

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Opening cash & bank" value={shortMoney(a.opening)} tone="sky" />
        <Stat label="Cash in" value={shortMoney(a.totalIn)} tone="mint" />
        <Stat label="Cash out" value={shortMoney(a.totalOpOut + a.refunds + a.investing + a.financing)} tone="rose" />
        <Stat label="Closing cash & bank" value={shortMoney(a.closing)} sub={<span className={a.net >= 0 ? "text-[#2f8f72]" : "text-[#c24f69]"}>{a.net >= 0 ? "+" : ""}{money(a.net)} this period</span>} tone="sun" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card pad={false} title="Statement of cash flows (direct method)" action={<Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={exportCsv}>CSV</Button>}>
          <Table head={["", "This period (Rs.)", "Previous", "Change"]}>
            <StRow label="Opening cash & bank balance" a={a.opening} b={b.opening} bold total />
            <Section t="Operating activities — cash received" />
            {Object.keys(a.inflow).map((k) => <StRow key={k} label={k} a={a.inflow[k]} b={b.inflow[k]} indent />)}
            <StRow label="Total receipts" a={a.totalIn} b={b.totalIn} bold />
            <Section t="Operating activities — cash paid" />
            <StRow label="Refunds to customers" a={a.refunds} b={b.refunds} indent neg />
            {outCats.map((c) => <StRow key={c} label={c} a={a.opOut[c] ?? 0} b={b.opOut[c] ?? 0} indent neg />)}
            <StRow label="Net cash from operating activities" a={a.netOperating} b={b.netOperating} bold total />
            <Section t="Investing activities" />
            <StRow label="Equipment & fit-out purchases" a={a.investing} b={b.investing} indent neg />
            <Section t="Financing activities" />
            <StRow label="Owner drawings" a={a.financing} b={b.financing} indent neg />
            <StRow label="Net change in cash" a={a.net} b={b.net} bold />
            <StRow label="Closing cash & bank balance" a={a.closing} b={b.closing} bold total />
          </Table>
        </Card>
        <div className="space-y-5">
          <Card title="Receipts by channel">
            {Object.entries(a.byMethod).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[#f2eee6] py-2 text-sm last:border-0">
                <span>{methodLabel[k]}</span>
                <span className="tabular font-bold">{money(v)}</span>
              </div>
            ))}
            <p className="mt-2 text-xs text-muted">Wallet spending is excluded here — the cash arrived at top-up.</p>
          </Card>
          <Card title="Running balance">
            <div className="h-[200px]">
              <ResponsiveContainer>
                <AreaChart data={daily}>
                  <CartesianGrid vertical={false} stroke="#f0ebe2" />
                  <XAxis dataKey="day" {...axis} interval="preserveStartEnd" />
                  <YAxis tickFormatter={shortMoney} {...axis} width={44} />
                  <Tooltip formatter={(v) => money(Number(v))} {...tip} />
                  <Area type="monotone" dataKey="balance" name="Balance" stroke={C.navy} fill={C.sky} fillOpacity={0.35} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
      <Card className="mt-5" title="Daily cash in vs out">
        <div className="h-[240px]">
          <ResponsiveContainer>
            <BarChart data={daily} stackOffset="sign">
              <CartesianGrid vertical={false} stroke="#f0ebe2" />
              <XAxis dataKey="day" {...axis} interval="preserveStartEnd" />
              <YAxis tickFormatter={shortMoney} {...axis} width={44} />
              <Tooltip formatter={(v) => money(Math.abs(Number(v)))} {...tip} />
              <Bar dataKey="in" name="Cash in" fill={C.mint} stackId="a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name="Cash out" fill={C.rose} stackId="a" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}

function Sales({ range, pdf }: { range: Range; pdf: PdfRef }) {
  const tx = useStore((s) => s.transactions);
  const sales = useStore((s) => s.sales);
  const users = useStore((s) => s.users);
  const t = useMemo(() => txInRange(tx, range).filter((x) => x.type !== "topup"), [tx, range]);
  const daily = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>();
    for (let d = new Date(range.from + "T00:00"); D(d) <= range.to; d.setDate(d.getDate() + 1)) m.set(D(d), { day: format(new Date(d), "d MMM"), play: 0, party: 0, cowork: 0, pos: 0 });
    t.forEach((x) => {
      const r = m.get(localDay(x.at));
      if (!r || x.amount < 0) return;
      const k = x.type === "overtime" ? "play" : x.type === "deposit" ? "party" : x.type;
      r[k] = ((r[k] as number) ?? 0) + x.amount;
    });
    return [...m.values()];
  }, [t, range]);
  const products = useMemo(() => {
    const m: Record<string, { name: string; qty: number; rev: number; profit: number }> = {};
    sales.filter((s) => localDay(s.at) >= range.from && localDay(s.at) <= range.to).forEach((s) => s.items.forEach((i) => {
      const r = (m[i.productId] ??= { name: i.name, qty: 0, rev: 0, profit: 0 });
      r.qty += i.qty;
      r.rev += i.qty * i.price;
      r.profit += i.qty * (i.price - i.cost);
    }));
    return Object.values(m).sort((a, b) => b.rev - a.rev).slice(0, 10);
  }, [sales, range]);
  const byStaff = useMemo(() => {
    const m: Record<string, { n: number; amt: number; disc: number }> = {};
    t.filter((x) => x.amount > 0).forEach((x) => { const r = (m[x.userId] ??= { n: 0, amt: 0, disc: 0 }); r.n++; r.amt += x.amount; r.disc += x.discount; });
    return Object.entries(m).sort((a, b) => b[1].amt - a[1].amt);
  }, [t]);
  const total = t.reduce((a, x) => a + x.amount, 0);
  const days = daily.length || 1;

  const newReport = useNewReport();
  usePdf(pdf, async () => {
    const r = await newReport("Sales report", longPeriod(range));
    const discounts = t.reduce((a, x) => a + x.discount, 0);
    r.kpis([
      { label: "Net sales", value: money(total) },
      { label: "Average per day", value: money(Math.round(total / days)) },
      { label: "Payments taken", value: num(t.filter((x) => x.amount > 0).length) },
      { label: "Discounts given", value: money(discounts) },
    ]);
    const streams = [["play", "Play area sessions"], ["party", "Party bookings"], ["cowork", "Co-work lounge"], ["pos", "Café & merchandise (POS)"]] as const;
    const byStream = streams.map(([k, label]) => [label, daily.reduce((a, d) => a + (d[k] as number), 0)] as const);
    const gross = byStream.reduce((a, [, v]) => a + v, 0);
    r.heading("Sales by revenue stream");
    r.table(["Stream", "Amount (Rs.)", "Share"], byStream.map(([l, v]) => [l, v, gross ? `${((v / gross) * 100).toFixed(1)}%` : "-"]), { align: ["l", "r", "r"], foot: ["Gross sales", gross, ""] });
    r.paragraph(`Refunds paid in the period: ${money(gross - total)}. Net sales after refunds: ${money(total)}. Wallet top-ups are not sales and are excluded.`);
    r.heading("Daily sales (Rs.)");
    r.table(
      ["Date", "Play", "Parties", "Co-work", "Café & shop", "Total"],
      daily.map((d) => [String(d.day), d.play as number, d.party as number, d.cowork as number, d.pos as number, (d.play as number) + (d.party as number) + (d.cowork as number) + (d.pos as number)]),
      { align: ["l", "r", "r", "r", "r", "r"], foot: ["Total", ...streams.map(([k]) => daily.reduce((a, d) => a + (d[k] as number), 0)), gross] },
    );
    r.heading("Top products (café & shop)");
    r.table(["Product", "Qty sold", "Revenue (Rs.)", "Gross profit (Rs.)"], products.map((x) => [x.name, count(x.qty), x.rev, x.profit]), { align: ["l", "r", "r", "r"] });
    r.heading("Takings by staff member");
    r.table(["Staff member", "Payments", "Amount (Rs.)", "Discounts (Rs.)"], byStaff.map(([id, x]) => [users.find((u) => u.id === id)?.name ?? id, count(x.n), x.amt, x.disc]), {
      align: ["l", "r", "r", "r"],
      foot: ["Total", count(byStaff.reduce((a, [, x]) => a + x.n, 0)), byStaff.reduce((a, [, x]) => a + x.amt, 0), byStaff.reduce((a, [, x]) => a + x.disc, 0)],
    });
    r.save(`sales-report_${fileRange(range)}`);
  });

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net sales" value={shortMoney(total)} tone="sky" />
        <Stat label="Average per day" value={shortMoney(total / days)} tone="mint" />
        <Stat label="Transactions" value={t.filter((x) => x.amount > 0).length} tone="lilac" />
        <Stat label="Discounts given" value={shortMoney(t.reduce((a, x) => a + x.discount, 0))} tone="rose" />
      </div>
      <Card title="Daily sales by stream">
        <div className="h-[280px]">
          <ResponsiveContainer>
            <BarChart data={daily}>
              <CartesianGrid vertical={false} stroke="#f0ebe2" />
              <XAxis dataKey="day" {...axis} interval="preserveStartEnd" />
              <YAxis tickFormatter={shortMoney} {...axis} width={44} />
              <Tooltip formatter={(v) => money(Number(v))} {...tip} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="play" name="Play" stackId="a" fill={C.sky} />
              <Bar dataKey="party" name="Parties" stackId="a" fill={C.lilac} />
              <Bar dataKey="cowork" name="Co-work" stackId="a" fill={C.mint} />
              <Bar dataKey="pos" name="Café & shop" stackId="a" fill={C.sun} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Top products" pad={false}>
          <Table head={["Product", "Qty", "Revenue", "Gross profit"]}>
            {products.map((p) => <tr key={p.name}><td className="font-bold">{p.name}</td><td className="tabular">{p.qty}</td><td className="tabular">{money(p.rev)}</td><td className="tabular text-[#2f8f72]">{money(p.profit)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Takings by staff member" pad={false}>
          <Table head={["Staff", "Payments", "Amount", "Discounts"]}>
            {byStaff.map(([id, r]) => <tr key={id}><td className="font-bold">{users.find((u) => u.id === id)?.name ?? id}</td><td className="tabular">{r.n}</td><td className="tabular">{money(r.amt)}</td><td className="tabular text-muted">{money(r.disc)}</td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}

function Occupancy({ range, pdf }: { range: Range; pdf: PdfRef }) {
  const tickets = useStore((s) => s.tickets);
  const zones = useStore((s) => s.zones);
  const t = useMemo(() => tickets.filter((x) => x.status !== "cancelled" && localDay(x.checkIn) >= range.from && localDay(x.checkIn) <= range.to), [tickets, range]);
  const playIds = useMemo(() => new Set(zones.filter((z) => z.kind === "play").map((z) => z.id)), [zones]);
  const coworkIds = useMemo(() => new Set(zones.filter((z) => z.kind === "cowork").map((z) => z.id)), [zones]);
  const play = t.filter((x) => playIds.has(x.zoneId));
  const daily = useMemo(() => {
    const m = new Map<string, { day: string; kids: number; cowork: number }>();
    for (let d = new Date(range.from + "T00:00"); D(d) <= range.to; d.setDate(d.getDate() + 1)) m.set(D(d), { day: format(new Date(d), "d MMM"), kids: 0, cowork: 0 });
    t.forEach((x) => { const r = m.get(localDay(x.checkIn)); if (r) { if (playIds.has(x.zoneId)) r.kids += x.visitors; else r.cowork += x.visitors; } });
    return [...m.values()];
  }, [t, range, playIds]);
  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0));
    const dayCount = Array(7).fill(0);
    for (let d = new Date(range.from + "T00:00"); D(d) <= range.to; d.setDate(d.getDate() + 1)) dayCount[d.getDay()]++;
    play.forEach((x) => { const d = new Date(x.checkIn); const h = d.getHours() - 9; if (h >= 0 && h < 12) grid[d.getDay()][h] += x.visitors; });
    return grid.map((row, i) => row.map((v) => (dayCount[i] ? v / dayCount[i] : 0)));
  }, [play, range]);
  const max = Math.max(1, ...heat.flat());
  const stays = play.filter((x) => x.checkOut).map((x) => (new Date(x.checkOut!).getTime() - new Date(x.checkIn).getTime()) / 60000);
  const avgStay = stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length : 0;
  const paidVisits = play.filter((x) => x.checkOut && x.total > 0);
  const kids = play.reduce((a, x) => a + x.visitors, 0);
  const cap = zones.filter((z) => z.kind === "play").reduce((a, z) => a + z.capacity, 0) || 40;
  const coworkVisits = t.filter((x) => coworkIds.has(x.zoneId)).reduce((a, x) => a + x.visitors, 0);
  const avgSpend = paidVisits.length ? Math.round(paidVisits.reduce((a, x) => a + x.total, 0) / paidVisits.length) : 0;

  const newReport = useNewReport();
  usePdf(pdf, async () => {
    const r = await newReport("Occupancy report", longPeriod(range));
    r.kpis([
      { label: "Kids visits", value: `${num(kids)} (${(kids / (daily.length || 1)).toFixed(0)}/day)` },
      { label: "Average stay", value: minsToLabel(avgStay) },
      { label: "Average spend per visit", value: money(avgSpend) },
      { label: "Co-work visits", value: num(coworkVisits) },
    ]);
    r.heading("Visitors per day");
    r.table(["Date", "Kids (play area)", "Co-work"], daily.map((d) => [d.day, count(d.kids), count(d.cowork)]), {
      align: ["l", "r", "r"],
      foot: ["Total", count(daily.reduce((a, d) => a + d.kids, 0)), count(daily.reduce((a, d) => a + d.cowork, 0))],
    });
    r.heading("Busy times — average kids arriving per hour");
    const hours = Array.from({ length: 12 }, (_, i) => `${((i + 9) % 12) || 12}${i + 9 >= 12 ? "pm" : "am"}`);
    r.table(["Day", ...hours], [1, 2, 3, 4, 5, 6, 0].map((d) => [["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d], ...heat[d].map((v) => (v ? v.toFixed(1) : "-"))]), { align: ["l", ...hours.map(() => "r" as const)] });
    r.paragraph(`Play-area capacity is ${cap}. Average arrivals are per day of the week over the period.`);
    r.save(`occupancy-report_${fileRange(range)}`);
  });

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Kids visits" value={kids} sub={`${(kids / (daily.length || 1)).toFixed(0)} per day`} tone="sky" />
        <Stat label="Average stay" value={minsToLabel(avgStay)} tone="mint" />
        <Stat label="Average spend per visit" value={money(paidVisits.length ? Math.round(paidVisits.reduce((a, x) => a + x.total, 0) / paidVisits.length) : 0)} sub={`${paidVisits.length} paid visits`} tone="rose" />
        <Stat label="Co-work visits" value={t.filter((x) => coworkIds.has(x.zoneId)).reduce((a, x) => a + x.visitors, 0)} tone="lilac" />
      </div>
      <Card title="Visitors per day">
        <div className="h-[240px]">
          <ResponsiveContainer>
            <BarChart data={daily}>
              <CartesianGrid vertical={false} stroke="#f0ebe2" />
              <XAxis dataKey="day" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} width={30} />
              <Tooltip {...tip} />
              <Bar dataKey="kids" name="Kids" fill={C.sky} radius={[4, 4, 0, 0]} />
              <Bar dataKey="cowork" name="Co-work" fill={C.mint} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="mt-5" title="Busy times — average kids arriving per hour">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 12 }, (_, i) => <th key={i} className="pb-1 font-bold text-muted">{((i + 9) % 12) || 12}{i + 9 >= 12 ? "p" : "a"}</th>)}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <tr key={d}>
                  <td className="pr-2 font-bold text-muted">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}</td>
                  {heat[d].map((v, i) => (
                    <td key={i} className="p-0.5">
                      <div className="grid h-8 place-items-center rounded-md tabular" style={{ background: `rgba(53,96,159,${0.06 + (v / max) * 0.8})`, color: v / max > 0.5 ? "white" : "#24395f" }}>{v ? v.toFixed(1) : ""}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Play-area capacity is {cap}. Use this to plan staffing and peak pricing.</p>
      </Card>
    </>
  );
}

function Loyalty({ range, pdf }: { range: Range; pdf: PdfRef }) {
  const tickets = useStore((s) => s.tickets);
  const customers = useStore((s) => s.customers);
  const promos = useStore((s) => s.promotions);
  const tx = useStore((s) => s.transactions);
  const settings = useStore((s) => s.settings);
  const t = tickets.filter((x) => x.status !== "cancelled" && localDay(x.checkIn) >= range.from && localDay(x.checkIn) <= range.to);
  const issued = t.reduce((a, x) => a + Math.floor((x.total / 100) * settings.pointsPer100), 0);
  const redeemed = t.reduce((a, x) => a + x.loyaltyUsed, 0);
  const cmap = new Map(customers.map((c) => [c.id, c]));
  const memberRev = t.filter((x) => cmap.get(x.customerId)?.member).reduce((a, x) => a + x.total, 0);
  const allRev = t.reduce((a, x) => a + x.total, 0);
  const promoUse = promos.map((p) => { const u = t.filter((x) => x.promoId === p.id); return { p, n: u.length, disc: u.reduce((a, x) => a + x.discount, 0), rev: u.reduce((a, x) => a + x.total, 0) }; }).sort((a, b) => b.n - a.n);
  const top = useMemo(() => {
    const m: Record<string, number> = {};
    txInRange(tx, range).forEach((x) => x.customerId && x.type !== "topup" && (m[x.customerId] = (m[x.customerId] ?? 0) + x.amount));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [tx, range]);
  const visitsBy = (id: string) => t.filter((x) => x.customerId === id).length;
  const newCust = customers.filter((c) => c.createdAt.slice(0, 10) >= range.from && c.createdAt.slice(0, 10) <= range.to).length;
  const repeat = new Set(t.map((x) => x.customerId)).size;

  const newReport = useNewReport();
  usePdf(pdf, async () => {
    const r = await newReport("Loyalty & promotions report", longPeriod(range));
    r.kpis([
      { label: "Points issued", value: num(issued) },
      { label: "Points redeemed", value: `${num(redeemed)} (${money(redeemed * settings.pointValue)})` },
      { label: "Member share of revenue", value: `${allRev ? Math.round((memberRev / allRev) * 100) : 0}%` },
      { label: "Families visiting", value: `${num(repeat)} (${newCust} new)` },
    ]);
    r.heading("Promotion performance");
    r.table(["Code", "Promotion", "Redemptions", "Discount given (Rs.)", "Revenue (Rs.)"], promoUse.map(({ p, n, disc, rev }) => [p.code, p.name, count(n), disc, rev]), {
      align: ["l", "l", "r", "r", "r"],
      foot: ["Total", "", count(promoUse.reduce((a, x) => a + x.n, 0)), promoUse.reduce((a, x) => a + x.disc, 0), promoUse.reduce((a, x) => a + x.rev, 0)],
    });
    r.heading("Top customers by spend");
    r.table(["Customer", "Member", "Visits", "Spend (Rs.)", "Points balance"], top.map(([id, v]) => [cmap.get(id)?.name ?? id, cmap.get(id)?.member ? "Yes" : "", count(visitsBy(id)), v, count(cmap.get(id)?.points ?? 0)]), { align: ["l", "c", "r", "r", "r"] });
    r.save(`loyalty-promotions_${fileRange(range)}`);
  });

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Points issued" value={issued.toLocaleString()} tone="sun" />
        <Stat label="Points redeemed" value={redeemed.toLocaleString()} sub={money(redeemed * settings.pointValue)} tone="lilac" />
        <Stat label="Member share of play revenue" value={`${allRev ? Math.round((memberRev / allRev) * 100) : 0}%`} tone="mint" />
        <Stat label="Families visiting" value={repeat} sub={`${newCust} new profiles`} tone="sky" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Promotion performance" pad={false}>
          <Table head={["Promotion", "Redemptions", "Discount given", "Revenue"]}>
            {promoUse.map(({ p, n, disc, rev }) => <tr key={p.id}><td><span className="font-mono text-xs font-bold">{p.code}</span> <span className="text-muted">· {p.name}</span></td><td className="tabular">{n}</td><td className="tabular text-[#c24f69]">{money(disc)}</td><td className="tabular">{money(rev)}</td></tr>)}
          </Table>
        </Card>
        <Card title="Top customers" pad={false}>
          <Table head={["Customer", "Visits", "Spend", "Points"]}>
            {top.map(([id, v]) => <tr key={id}><td className="font-bold">{cmap.get(id)?.name}{cmap.get(id)?.member && <span className="ml-1 text-[#e0b13a]">★</span>}</td><td className="tabular">{visitsBy(id)}</td><td className="tabular">{money(v)}</td><td className="tabular text-muted">{cmap.get(id)?.points}</td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}

function Parties({ range, pdf }: { range: Range; pdf: PdfRef }) {
  const bookings = useStore((s) => s.bookings);
  const packages = useStore((s) => s.packages);
  const customers = useStore((s) => s.customers);
  const b = bookings.filter((x) => x.kind === "party" && x.date >= range.from && x.date <= range.to);
  const live = b.filter((x) => x.status !== "cancelled");
  const rev = live.reduce((a, x) => a + x.total, 0);
  const full = live.filter((x) => x.mode === "full");
  const byPkg = packages.map((p) => ({ name: p.name, room: live.filter((x) => x.packageId === p.id && x.mode === "room").length, full: live.filter((x) => x.packageId === p.id && x.mode === "full").length }));
  const monthly = useMemo(() => {
    const m: Record<string, number> = {};
    bookings.filter((x) => x.kind === "party" && x.status !== "cancelled").forEach((x) => (m[x.date.slice(0, 7)] = (m[x.date.slice(0, 7)] ?? 0) + x.total));
    return Object.entries(m).sort().map(([k, v]) => ({ month: format(new Date(k + "-01"), "MMM"), value: v }));
  }, [bookings]);

  const newReport = useNewReport();
  usePdf(pdf, async () => {
    const r = await newReport("Parties report", longPeriod(range));
    r.kpis([
      { label: "Parties", value: `${num(live.length)} (${b.length - live.length} cancelled)` },
      { label: "Party value", value: money(rev) },
      { label: "Full-venue hires", value: `${num(full.length)} (${live.length ? Math.round((full.length / live.length) * 100) : 0}%)` },
      { label: "Booked online", value: num(live.filter((x) => x.source === "online").length) },
    ]);
    r.heading("Packages — party room only vs full venue");
    r.table(["Package", "Party room", "Full venue", "Total"], byPkg.map((x) => [x.name, count(x.room), count(x.full), count(x.room + x.full)]), {
      align: ["l", "r", "r", "r"],
      foot: ["Total", count(byPkg.reduce((a, x) => a + x.room, 0)), count(byPkg.reduce((a, x) => a + x.full, 0)), count(byPkg.reduce((a, x) => a + x.room + x.full, 0))],
    });
    r.heading("Parties in the period");
    const list = [...b].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
    r.table(
      ["Date", "Ref", "Customer", "Package", "Type", "Guests", "Total (Rs.)", "Paid (Rs.)", "Status"],
      list.map((x) => [`${format(new Date(x.date + "T00:00"), "d MMM")} ${x.start}`, x.ref, customers.find((c) => c.id === x.customerId)?.name ?? "", packages.find((p) => p.id === x.packageId)?.name ?? "", x.mode === "full" ? "Full venue" : "Room", count(x.guests), x.total, x.paid, titleCase(x.status)]),
      { align: ["l", "l", "l", "l", "l", "r", "r", "r", "l"], foot: ["Total (excl. cancelled)", "", "", "", "", count(live.reduce((a, x) => a + x.guests, 0)), rev, live.reduce((a, x) => a + x.paid, 0), ""] },
    );
    r.save(`parties-report_${fileRange(range)}`);
  });
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Parties" value={live.length} sub={`${b.length - live.length} cancelled`} tone="lilac" />
        <Stat label="Party value" value={shortMoney(rev)} sub={`avg ${shortMoney(rev / (live.length || 1))}`} tone="sky" />
        <Stat label="Full-venue hires" value={full.length} sub={`${live.length ? Math.round((full.length / live.length) * 100) : 0}% of parties`} tone="rose" />
        <Stat label="Booked online" value={live.filter((x) => x.source === "online").length} tone="mint" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Packages — room only vs full venue">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={byPkg}>
                <CartesianGrid vertical={false} stroke="#f0ebe2" />
                <XAxis dataKey="name" {...axis} />
                <YAxis allowDecimals={false} {...axis} width={30} />
                <Tooltip {...tip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="room" name="Party room" fill={C.lilac} radius={[4, 4, 0, 0]} />
                <Bar dataKey="full" name="Full venue" fill={C.rose} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Party value by month (incl. future bookings)">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <LineChart data={monthly}>
                <CartesianGrid vertical={false} stroke="#f0ebe2" />
                <XAxis dataKey="month" {...axis} />
                <YAxis tickFormatter={shortMoney} {...axis} width={44} />
                <Tooltip formatter={(v) => money(Number(v))} {...tip} />
                <Line type="monotone" dataKey="value" stroke={C.navy} strokeWidth={2.5} dot={{ r: 4, fill: C.lilac }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
