"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, endOfMonth, format, startOfMonth, startOfQuarter, subDays, subMonths } from "date-fns";
import { Download, Printer } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore, useCan } from "@/lib/store";
import { balanceBefore, cashFlow, localDay, profitAndLoss, REVENUE_LINES, txInRange, type Range } from "@/lib/accounting";
import { cx, downloadCSV, methodLabel, minsToLabel, money, shortMoney, today } from "@/lib/utils";
import { Button, Card, Input, NoAccess, PageHeader, Select, Stat, Table, Tabs } from "@/components/ui";

const C = { sky: "#93bfea", rose: "#f29cae", mint: "#8bd4bd", sun: "#ffd56b", lilac: "#b9a3dc", teal: "#63c1ca", navy: "#35609f" };
const tip = { contentStyle: { borderRadius: 12, border: "1px solid #ebe5da", fontSize: 12 } };
const axis = { tick: { fontSize: 11, fill: "#8a92a5" }, tickLine: false, axisLine: false };
const D = (d: Date) => format(d, "yyyy-MM-dd");

type Preset = "month" | "last" | "30" | "quarter" | "custom";

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
            <Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
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
        {tab === "pl" && <PL range={range} prev={prev} />}
        {tab === "cf" && <CF range={range} prev={prev} />}
        {tab === "sales" && <Sales range={range} />}
        {tab === "occ" && <Occupancy range={range} />}
        {tab === "loyalty" && <Loyalty range={range} />}
        {tab === "party" && <Parties range={range} />}
      </div>
    </>
  );
}

function pct(a: number, b: number) {
  if (!b) return "—";
  const v = ((a - b) / Math.abs(b)) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function StRow({ label, a, b, bold, indent, neg, total }: { label: string; a: number; b: number; bold?: boolean; indent?: boolean; neg?: boolean; total?: boolean }) {
  const show = (v: number) => (neg ? `(${money(v, false)})` : money(v, false));
  return (
    <tr className={cx(total && "bg-[#faf7f1]", bold && "font-bold")}>
      <td className={cx(indent && "!pl-10", total && "font-display text-[15px]")}>{label}</td>
      <td className="text-right tabular">{show(a)}</td>
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

function PL({ range, prev }: { range: Range; prev: Range }) {
  const tx = useStore((s) => s.transactions);
  const sales = useStore((s) => s.sales);
  const expenses = useStore((s) => s.expenses);
  const a = useMemo(() => profitAndLoss(tx, sales, expenses, range), [tx, sales, expenses, range]);
  const b = useMemo(() => profitAndLoss(tx, sales, expenses, prev), [tx, sales, expenses, prev]);
  const cats = Array.from(new Set([...Object.keys(a.opex), ...Object.keys(b.opex)])).sort((x, y) => (a.opex[y] ?? 0) - (a.opex[x] ?? 0));

  const exportCsv = () =>
    downloadCSV(`profit-and-loss_${range.from}_${range.to}.csv`, [
      ["Line", "Current", "Previous"],
      ...REVENUE_LINES.map((l) => [l.label, a.rev[l.key], b.rev[l.key]]),
      ["Gross revenue", a.grossRevenue, b.grossRevenue],
      ["Refunds", -a.refunds, -b.refunds],
      ["Net revenue", a.netRevenue, b.netRevenue],
      ["Cost of goods sold", -a.cogs, -b.cogs],
      ["Gross profit", a.grossProfit, b.grossProfit],
      ...cats.map((c) => [c, -(a.opex[c] ?? 0), -(b.opex[c] ?? 0)]),
      ["Total operating expenses", -a.totalOpex, -b.totalOpex],
      ["Net profit", a.netProfit, b.netProfit],
    ]);

  const pie = REVENUE_LINES.map((l, i) => ({ name: l.label, value: a.rev[l.key], fill: [C.sky, C.rose, C.lilac, C.mint, C.sun][i] })).filter((x) => x.value > 0);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net revenue" value={shortMoney(a.netRevenue)} sub={`${pct(a.netRevenue, b.netRevenue)} vs previous`} tone="sky" />
        <Stat label="Gross profit" value={shortMoney(a.grossProfit)} sub={`after ${shortMoney(a.cogs)} cost of goods`} tone="mint" />
        <Stat label="Operating expenses" value={shortMoney(a.totalOpex)} sub={`${pct(a.totalOpex, b.totalOpex)} vs previous`} tone="rose" />
        <Stat label="Net profit" value={<span className={a.netProfit < 0 ? "text-[#c24f69]" : ""}>{shortMoney(a.netProfit)}</span>} sub={`${(a.margin * 100).toFixed(1)}% margin`} tone="sun" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card pad={false} title="Statement of profit or loss" action={<Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={exportCsv}>CSV</Button>}>
          <Table head={["", "This period (Rs.)", "Previous", "Change"]}>
            <Section t="Revenue" />
            {REVENUE_LINES.map((l) => <StRow key={l.key} label={l.label} a={a.rev[l.key]} b={b.rev[l.key]} indent />)}
            <StRow label="Gross revenue" a={a.grossRevenue} b={b.grossRevenue} bold />
            <StRow label="Less: refunds" a={a.refunds} b={b.refunds} indent neg />
            <StRow label="Net revenue" a={a.netRevenue} b={b.netRevenue} bold total />
            <Section t="Cost of sales" />
            <StRow label="Café & merchandise — cost of goods sold" a={a.cogs} b={b.cogs} indent neg />
            <StRow label="Gross profit" a={a.grossProfit} b={b.grossProfit} bold total />
            <Section t="Operating expenses" />
            {cats.map((c) => <StRow key={c} label={c} a={a.opex[c] ?? 0} b={b.opex[c] ?? 0} indent neg />)}
            <StRow label="Total operating expenses" a={a.totalOpex} b={b.totalOpex} bold neg />
            <StRow label="Net profit" a={a.netProfit} b={b.netProfit} bold total />
          </Table>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Cash basis. Party deposits are recognised when received. Wallet top-ups are customer balances (not revenue) until spent. Stock purchases are expensed through cost of goods sold; equipment (capex) and owner drawings are excluded and appear in the cash flow statement. Promotional discounts given: {money(a.discounts)}.
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
          <Card title="Expense split">
            {cats.slice(0, 8).map((c) => (
              <div key={c} className="mb-2">
                <div className="flex justify-between text-sm"><span>{c}</span><span className="tabular text-muted">{money(a.opex[c] ?? 0)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-[#f1ece3]"><div className="h-1.5 rounded-full bg-rose" style={{ width: `${((a.opex[c] ?? 0) / (a.totalOpex || 1)) * 100}%` }} /></div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

function CF({ range, prev }: { range: Range; prev: Range }) {
  const tx = useStore((s) => s.transactions);
  const expenses = useStore((s) => s.expenses);
  const settings = useStore((s) => s.settings);
  const openA = balanceBefore(tx, expenses, range.from, settings.openingCash);
  const openB = balanceBefore(tx, expenses, prev.from, settings.openingCash);
  const a = useMemo(() => cashFlow(tx, expenses, range, openA), [tx, expenses, range, openA]);
  const b = useMemo(() => cashFlow(tx, expenses, prev, openB), [tx, expenses, prev, openB]);
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

function Sales({ range }: { range: Range }) {
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

function Occupancy({ range }: { range: Range }) {
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
  const ot = play.filter((x) => x.overtimeFee > 0);
  const kids = play.reduce((a, x) => a + x.visitors, 0);
  const cap = zones.filter((z) => z.kind === "play").reduce((a, z) => a + z.capacity, 0) || 40;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Kids visits" value={kids} sub={`${(kids / (daily.length || 1)).toFixed(0)} per day`} tone="sky" />
        <Stat label="Average stay" value={minsToLabel(avgStay)} tone="mint" />
        <Stat label="Went into overtime" value={`${play.length ? Math.round((ot.length / play.length) * 100) : 0}%`} sub={`${money(ot.reduce((a, x) => a + x.overtimeFee, 0))} collected`} tone="rose" />
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

function Loyalty({ range }: { range: Range }) {
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

function Parties({ range }: { range: Range }) {
  const bookings = useStore((s) => s.bookings);
  const packages = useStore((s) => s.packages);
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
