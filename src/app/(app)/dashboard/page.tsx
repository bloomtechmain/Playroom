"use client";

import Link from "next/link";
import { useMemo } from "react";
import { subDays, format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Baby, Gauge, TrendingUp, TrendingDown, CalendarClock, Megaphone, ArrowRight } from "lucide-react";
import { useStore, useCan, useMe } from "@/lib/store";
import { useAlerts, useOccupancy } from "@/lib/hooks";
import { dailySeries, expenseCategories, localDay, sectionOf } from "@/lib/accounting";
import { Badge, Card, Meter, NoAccess, PageHeader, Stat, toneCls, Button } from "@/components/ui";
import { cx, money, methodLabel, shortMoney, today, timeToMin } from "@/lib/utils";

export default function Dashboard() {
  const can = useCan();
  const me = useMe();
  if (!can("dashboard.view")) return <FloorHome name={me?.name ?? ""} />;
  return <Exec />;
}

function Exec() {
  const tx = useStore((s) => s.transactions);
  const expenses = useStore((s) => s.expenses);
  const bookings = useStore((s) => s.bookings);
  const promos = useStore((s) => s.promotions);
  const customers = useStore((s) => s.customers);
  const packages = useStore((s) => s.packages);
  const tickets = useStore((s) => s.tickets);
  const settings = useStore((s) => s.settings);
  const cats = useMemo(() => expenseCategories(settings), [settings]);
  const occ = useOccupancy();
  const alerts = useAlerts();
  const d = today();

  const m = useMemo(() => {
    const todayTx = tx.filter((t) => localDay(t.at) === d && t.type !== "topup");
    const revenue = todayTx.reduce((a, t) => a + t.amount, 0);
    const yTx = tx.filter((t) => localDay(t.at) === format(subDays(new Date(), 7), "yyyy-MM-dd") && t.type !== "topup");
    const lastWeek = yTx.reduce((a, t) => a + t.amount, 0);
    const exp = expenses.filter((e) => e.date === d && !["capex", "drawings"].includes(sectionOf(cats, e.category))).reduce((a, e) => a + e.amount, 0);
    const pending = bookings.filter((b) => b.kind === "party" && (b.status === "confirmed" || b.status === "pending") && b.date >= d);
    const pendingBal = pending.reduce((a, b) => a + (b.total - b.paid), 0);
    const mix: Record<string, number> = {};
    todayTx.filter((t) => t.amount > 0).forEach((t) => (mix[t.method] = (mix[t.method] ?? 0) + t.amount));
    const visitsToday = tickets.filter((t) => localDay(t.checkIn) === d && t.status !== "cancelled").reduce((a, t) => a + t.visitors, 0);
    return { revenue, lastWeek, exp, pendingBal, pendingCount: pending.length, mix, visitsToday };
  }, [tx, expenses, bookings, tickets, d, cats]);

  const series = useMemo(
    () => dailySeries(tx, expenses, { from: format(subDays(new Date(), 13), "yyyy-MM-dd"), to: d }, cats).map((r) => ({ ...r, label: format(new Date(r.day + "T00:00"), "d MMM") })),
    [tx, expenses, d, cats],
  );

  const play = occ.find((o) => o.zone.kind === "play");
  const totalInside = occ.filter((o) => o.zone.kind !== "party").reduce((a, o) => a + o.inside, 0);
  const totalCap = occ.filter((o) => o.zone.kind !== "party").reduce((a, o) => a + o.zone.capacity, 0);
  const activePromos = promos.filter((p) => p.active && p.validFrom <= d && p.validTo >= d && (!p.usageCap || p.used < p.usageCap));
  const todays = bookings.filter((b) => b.date === d && b.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start));
  const delta = m.lastWeek ? (m.revenue - m.lastWeek) / m.lastWeek : 0;
  const mixTotal = Object.values(m.mix).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Today at The Playroom" subtitle="Live view of the floor, the till and what's coming up." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Kids on the floor" value={play?.inside ?? 0} sub={`${m.visitsToday} visitors so far today`} tone="sky" icon={<Baby size={17} />} />
        <Stat label="Occupancy" value={`${totalCap ? Math.round((totalInside / totalCap) * 100) : 0}%`} sub={`${totalInside} of ${totalCap} spots in use`} tone="mint" icon={<Gauge size={17} />} />
        <Stat
          label="Revenue today"
          value={shortMoney(m.revenue)}
          sub={<span className={delta >= 0 ? "text-[#2f8f72]" : "text-[#c24f69]"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% vs last {format(new Date(), "EEEE")}</span>}
          tone="sun"
          icon={<TrendingUp size={17} />}
        />
        <Stat label="Expenses today" value={shortMoney(m.exp)} sub="Recorded operating costs" tone="rose" icon={<TrendingDown size={17} />} />
        <Stat label="Party balances due" value={shortMoney(m.pendingBal)} sub={`${m.pendingCount} upcoming parties`} tone="lilac" icon={<CalendarClock size={17} />} />
        <Stat label="Active campaigns" value={activePromos.length} sub={activePromos.slice(0, 2).map((p) => p.code).join(" · ")} tone="teal" icon={<Megaphone size={17} />} />
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {alerts.map((a) => (
            <Link key={a.id} href={a.href} className={cx("rounded-xl px-3 py-2 text-sm", toneCls[a.tone].soft)}>
              <b className={toneCls[a.tone].text}>{a.title}</b> <span className="text-ink/70">· {a.text}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {occ.map((o) => (
          <Card key={o.zone.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[13px] font-bold text-muted">{o.zone.name}</div>
                <div className="mt-1 font-display text-3xl font-semibold tabular">
                  {o.inside}
                  <span className="text-lg text-muted"> / {o.zone.capacity}</span>
                </div>
              </div>
              {o.locked ? (
                <Badge tone="rose">Locked · party</Badge>
              ) : o.full ? (
                <Badge tone="rose">Full</Badge>
              ) : o.nearFull ? (
                <Badge tone="sun">Nearly full</Badge>
              ) : o.zone.kind === "party" ? (
                <Badge tone={o.partyNow ? "lilac" : "gray"}>{o.partyNow ? "Party running" : "Free now"}</Badge>
              ) : (
                <Badge tone="mint">Open</Badge>
              )}
            </div>
            <div className="mt-3">
              <Meter value={o.inside} max={o.zone.capacity} warnAt={o.zone.nearFullPct / 100} />
            </div>
            <div className="mt-2 text-xs text-muted">
              {o.zone.kind === "party"
                ? o.partyNow
                  ? `${o.partyNow.ref} · ${o.partyNow.theme} until ${o.partyNow.end}`
                  : "No party in the room right now"
                : o.locked
                  ? `Walk-ins paused for ${o.lock?.ref} until ${o.lock?.end}`
                  : `${o.available} spots free · alert at ${o.zone.nearFullPct}%`}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="Revenue vs expenses · last 14 days" action={<Link href="/reports" className="text-xs font-bold text-navy hover:underline">Full reports →</Link>}>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={series} barGap={2}>
                <CartesianGrid vertical={false} stroke="#f0ebe2" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a92a5" }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: "#8a92a5" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "#f7f3ec" }} contentStyle={{ borderRadius: 12, border: "1px solid #ebe5da" }} />
                <Bar dataKey="revenue" name="Revenue" fill="#93bfea" radius={[6, 6, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expenses" name="Expenses" fill="#f29cae" radius={[6, 6, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="How guests paid today">
          {mixTotal === 0 && <p className="text-sm text-muted">No payments yet today.</p>}
          <div className="space-y-3">
            {Object.entries(m.mix)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v], i) => (
                <div key={k}>
                  <div className="flex justify-between text-sm">
                    <span className="font-bold">{methodLabel[k]}</span>
                    <span className="tabular text-muted">{money(v)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-[#f1ece3]">
                    <div className={cx("h-2 rounded-full", ["bg-sky", "bg-mint", "bg-lilac", "bg-sun", "bg-rose", "bg-teal"][i])} style={{ width: `${(v / mixTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-5 flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Collected today</span>
            <b className="tabular">{money(mixTotal)}</b>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card title="Today's bookings" action={<Link href="/bookings" className="text-xs font-bold text-navy hover:underline">Calendar →</Link>} pad={false}>
          {todays.length === 0 && <p className="p-5 text-sm text-muted">Nothing booked for today.</p>}
          {todays.map((b) => {
            const c = customers.find((x) => x.id === b.customerId);
            const pk = packages.find((x) => x.id === b.packageId);
            const now = new Date().getHours() * 60 + new Date().getMinutes();
            const live = now >= timeToMin(b.start) && now < timeToMin(b.end);
            return (
              <div key={b.id} className="flex items-center gap-4 border-b border-[#f2eee6] px-5 py-3 last:border-0">
                <div className="w-16 text-center">
                  <div className="font-display text-lg font-semibold">{b.start}</div>
                  <div className="text-[11px] text-muted">to {b.end}</div>
                </div>
                <div className={cx("h-10 w-1 rounded-full", b.mode === "full" ? "bg-rose" : b.kind === "party" ? "bg-lilac" : "bg-sky")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {b.kind === "party" ? `${pk?.name ?? "Party"} — ${b.theme}` : "Play reservation"}
                  </div>
                  <div className="text-xs text-muted">
                    {c?.name} · {b.guests} guests · {b.ref}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {b.mode === "full" && <Badge tone="rose">Full venue</Badge>}
                  {live && <Badge tone="mint">In progress</Badge>}
                  {b.total - b.paid > 0 && <span className="text-xs font-bold text-[#c24f69]">Due {money(b.total - b.paid)}</span>}
                </div>
              </div>
            );
          })}
        </Card>
        <Card title="Running promotions" action={<Link href="/pricing" className="text-xs font-bold text-navy hover:underline">Manage →</Link>} pad={false}>
          {activePromos.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-[#f2eee6] px-5 py-3 last:border-0">
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-muted">
                  <span className="rounded bg-sun-soft px-1.5 py-0.5 font-mono text-[11px] text-[#8a6510]">{p.code}</span> · until {p.validTo} {p.auto && "· auto-applied"}
                </div>
              </div>
              <div className="text-right text-xs text-muted">
                <div className="font-bold text-ink">{p.used} used</div>
                {p.usageCap ? `of ${p.usageCap}` : "no cap"}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function FloorHome({ name }: { name: string }) {
  const can = useCan();
  const occ = useOccupancy();
  const links = [
    { href: "/front-desk", label: "New ticket / check-in", perm: "tickets.sell", tone: "rose" as const },
    { href: "/sessions", label: "Scan & check-out", perm: "tickets.checkout", tone: "mint" as const },
    { href: "/pos", label: "Open POS", perm: "pos.sell", tone: "sun" as const },
    { href: "/bookings", label: "Bookings calendar", perm: "bookings.view", tone: "lilac" as const },
    { href: "/expenses", label: "Expenses", perm: "expenses.view", tone: "rose" as const },
    { href: "/reports", label: "Reports", perm: "reports.view", tone: "teal" as const },
  ].filter((l) => can(l.perm));
  if (!links.length && !can("zones.view")) return <NoAccess what="the dashboard" />;
  return (
    <>
      <PageHeader title={`Hi ${name.split(" ")[0]}!`} subtitle="Here's where to start." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={cx("flex items-center justify-between rounded-2xl border border-line p-5 font-display text-lg font-medium hover:shadow-sm", toneCls[l.tone].soft)}>
            {l.label} <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      {can("zones.view") && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {occ.map((o) => (
            <Card key={o.zone.id}>
              <div className="flex justify-between text-sm font-bold">
                {o.zone.name}
                <span className="tabular">{o.inside}/{o.zone.capacity}</span>
              </div>
              <div className="mt-2">
                <Meter value={o.inside} max={o.zone.capacity} warnAt={o.zone.nearFullPct / 100} />
              </div>
              {o.locked && <p className="mt-2 text-xs font-bold text-[#c24f69]">Locked for exclusive party until {o.lock?.end}</p>}
            </Card>
          ))}
        </div>
      )}
      <div className="mt-6">
        <Link href="/profile"><Button variant="secondary">My profile</Button></Link>
      </div>
    </>
  );
}
