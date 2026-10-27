"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, ScanLine, ShieldAlert } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { useNow, useScanField } from "@/lib/hooks";
import { BLOCK_MINUTES, comboShares, stayInputFor, stayQuote, visitOf, type StayQuote } from "@/lib/pricing";
import type { PayMethod, Ticket } from "@/lib/types";
import { cx, fmtDT, fmtTime, minsToLabel, money } from "@/lib/utils";
import { Badge, Button, Card, Input, NoAccess, PageHeader, Select, Table, Tabs, toast } from "@/components/ui";
import QRScanner from "@/components/QRScanner";
import { PaymentPicker } from "@/components/Payment";
import ShiftGate from "@/components/ShiftGate";
import { PrintModal, TicketReceipt } from "@/components/Receipts";
import { ticketDoc } from "@/lib/receiptDocs";

export default function Sessions() {
  const can = useCan();
  if (!can("tickets.checkout")) return <NoAccess what="check-out" />;
  return <Inner />;
}

/** Prices tickets the same way the server will at check-out. */
function usePricer() {
  const zones = useStore((s) => s.zones);
  const ratePlans = useStore((s) => s.ratePlans);
  const rules = useStore((s) => s.rules);
  const promos = useStore((s) => s.promotions);
  const settings = useStore((s) => s.settings);
  const customers = useStore((s) => s.customers);
  const children = useStore((s) => s.children);
  const tickets = useStore((s) => s.tickets);
  return useMemo(() => {
    return (visit: Ticket[], now: Date, opts: { promoChoice?: string | null } = {}) => {
      const first = visit[0];
      const ids = new Set(visit.map((t) => t.id));
      const prior = tickets.filter((t) => t.customerId === first.customerId && t.status !== "cancelled" && !ids.has(t.id)).length;
      const member = !!customers.find((c) => c.id === first.customerId)?.member;
      return visit.map((t) => {
        const inp = stayInputFor(t, { zones, ratePlans, children }, member, prior);
        return { t, q: inp ? stayQuote(inp, rules, settings, promos, now, opts) : undefined };
      });
    };
  }, [zones, ratePlans, rules, promos, settings, customers, children, tickets]);
}

const totalOf = (lines: { q?: StayQuote }[]) => lines.reduce((a, l) => a + (l.q?.total ?? 0), 0);

function Inner() {
  const can = useCan();
  const tickets = useStore((s) => s.tickets);
  const zones = useStore((s) => s.zones);
  const promos = useStore((s) => s.promotions);
  const customers = useStore((s) => s.customers);
  const children = useStore((s) => s.children);
  const settings = useStore((s) => s.settings);
  const checkout = useStore((s) => s.checkoutVisit);
  const price = usePricer();
  const now = useNow(10000);
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<{ code: string; at: number } | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [zoneF, setZoneF] = useState("all");
  const [done, setDone] = useState<Ticket[] | null>(null);
  const [points, setPoints] = useState(0);
  const [promoChoice, setPromoChoice] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [receipt, setReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanRef, refocusScan] = useScanField();

  const found = lookup ? tickets.find((t) => t.code.toLowerCase() === lookup.code.toLowerCase()) : undefined;
  const visit = found ? visitOf(found, tickets).filter((t) => t.status === "active") : [];

  const scan = (text: string) => {
    const c = text.trim();
    if (!c) return;
    setDone(null);
    setTendered("");
    setPoints(0);
    setPromoChoice(null);
    setManual("");
    setLookup({ code: c, at: Date.now() });
    setCode("");
    refocusScan();
  };

  const active = useMemo(
    () =>
      tickets
        .filter((t) => t.status === "active" && (zoneF === "all" || t.zoneId === zoneF))
        .map((t) => ({ t, line: price([t], now)[0] }))
        .sort((a, b) => b.t.checkIn.localeCompare(a.t.checkIn)),
    [tickets, now, zoneF, price],
  );

  const doCheckout = async (due: number, loyalty: number, manualAmt: number) => {
    if (!found || busy) return;
    if (due > 0 && method === "cash" && tendered && Number(tendered) < due) return toast("Cash received is less than the amount due", "err");
    setBusy(true);
    const out = await checkout(found.id, { method, points: Math.ceil(loyalty / (settings.pointValue || 1)), promoId: promoChoice, manualDiscount: manualAmt });
    setBusy(false);
    if (!out) return;
    setDone(out);
    setReceipt(true);
    refocusScan();
    toast(`${out[0].visitId ?? out[0].code} paid ${money(out.reduce((a, t) => a + t.paid, 0))} & checked out`);
  };

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? "";

  return (
    <>
      <PageHeader title="Live Sessions" subtitle="Scan the ticket QR at the exit — the system works out the time spent in each area, charges the best rate and takes payment." />
      <ShiftGate />
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card title={<span className="flex items-center gap-2"><ScanLine size={17} /> Scan ticket</span>}>
          <QRScanner onScan={scan} height={230} />
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              scan(code);
            }}
          >
            <Input ref={scanRef} placeholder="Scan or type ticket code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            <Button>Find</Button>
          </form>
          <p className="mt-2 text-xs text-muted">USB/Bluetooth scanners type straight into this box.</p>
        </Card>

        <div>
          {!lookup && !done && (
            <Card>
              <div className="py-10 text-center text-muted">
                <ScanLine className="mx-auto mb-2" />
                Waiting for a scan…
              </div>
            </Card>
          )}
          {lookup && !found && <Result tone="rose" icon={<CircleAlert />} title="Ticket not found" text={`No ticket matches "${lookup.code}". Check the code or search the tickets list.`} />}
          {found && done && (
            <Result
              tone="mint"
              icon={<CheckCircle2 />}
              title={`Checked out · ${done[0].visitId ?? done[0].code}`}
              text={`Total stay ${minsToLabel(done[0].minutes)}. Paid ${money(done.reduce((a, t) => a + t.paid, 0))}. Gate cleared.`}
            />
          )}
          {found && !done && !visit.length && (
            <Result
              tone="rose"
              icon={<ShieldAlert />}
              title={found.status === "completed" ? "Duplicate scan — already checked out" : `Ticket is ${found.status}`}
              text={found.status === "completed" ? `${found.code} was checked out at ${fmtDT(found.checkOut!)}. This ticket can't be used again.` : `${found.code} can't be used for entry or exit. Status: ${found.status}.`}
            />
          )}
          {found && !done && visit.length > 0 && (() => {
            const lines = price(visit, now, { promoChoice });
            const c = customers.find((x) => x.id === found.customerId);
            const kids = children.filter((k) => visit.some((t) => t.childIds.includes(k.id)));
            const noRate = lines.find((l) => !l.q?.plan);
            const combo = comboShares(settings, lines.map((l) => ({ kind: zones.find((z) => z.id === l.t.zoneId)?.kind ?? "play", total: l.q?.total ?? 0 })));
            const comboOff = combo.reduce((a, b) => a + b, 0);
            const gross = totalOf(lines) - comboOff;
            const manualAmt = Math.min(Number(manual) || 0, gross);
            const loyalty = Math.min(gross - manualAmt, Math.min(points, c?.points ?? 0) * settings.pointValue);
            const due = gross - manualAmt - loyalty;
            const stay = lines[0].q?.minutes ?? 0;
            const promoErr = lines.map((l) => l.q?.promoError).find(Boolean);
            return (
              <Card title={`${found.visitId ?? found.code} · ${visit.map((t) => zoneName(t.zoneId)).join(" + ")}`} action={<Badge tone="sky"><Clock3 size={11} /> {minsToLabel(stay)}</Badge>}>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-1.5 text-sm">
                    <Row l="Guardian" r={c?.name} />
                    {kids.length > 0 && <Row l="Children" r={kids.map((k) => k.name.split(" ")[0]).join(", ")} />}
                    <Row l="Checked in" r={fmtTime(found.checkIn)} />
                    <Row l="Time spent" r={<b>{minsToLabel(stay)}</b>} />
                    {visit.map((t) => (
                      <Row key={t.id} l={zoneName(t.zoneId)} r={zones.find((z) => z.id === t.zoneId)?.kind === "play" ? `${t.visitors} kid(s)${t.adults ? ` + ${t.adults} adult(s)` : ""}` : `${t.visitors} person(s)`} />
                    ))}
                  </div>
                  <div className="rounded-2xl bg-[#faf7f1] p-4">
                    {noRate ? (
                      <p className="text-sm font-bold text-[#a63a54]">{zoneName(noRate.t.zoneId)} has no active rate — add one in Pricing to check this visit out.</p>
                    ) : (
                      <>
                        <div className="space-y-1 text-sm">
                          {lines.map(({ t, q }) => (
                            <div key={t.id} className="space-y-1">
                              {visit.length > 1 && <div className="pt-1 text-xs font-bold uppercase tracking-wider text-muted">{zoneName(t.zoneId)}</div>}
                              <Row l={`${minsToLabel(q!.blocks * BLOCK_MINUTES)} × ${t.visitors}`} r={money(q!.base - q!.guardianFee)} />
                              {q!.guardianFee > 0 && <Row l={`Guardians × ${t.adults}`} r={money(q!.guardianFee)} />}
                              {q!.applied.map((r) => (
                                <Row key={r.id} l={r.name} r={money(r.adjust === "percent" ? Math.round((q!.base * r.value) / 100) : r.value * t.visitors)} />
                              ))}
                              {q!.promo && (q!.discount > 0 || q!.bonusMinutes > 0) && (
                                <Row l={`${q!.promo.code}${q!.bonusMinutes ? ` · ${q!.bonusMinutes} min free` : ""}`} r={<span className="text-[#2f8f72]">{q!.discount ? `-${money(q!.discount)}` : "applied"}</span>} />
                              )}
                            </div>
                          ))}
                          {comboOff > 0 && (
                            <div className="border-t border-dashed border-line pt-2">
                              <Row l="Play + co-work discount" r={<span className="text-[#2f8f72]">-{money(comboOff)}</span>} />
                            </div>
                          )}
                          <div className="space-y-2 border-t border-dashed border-line pt-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted">Promotion</span>
                              <Select className="h-8 w-44" value={promoChoice ?? "__auto"} onChange={(e) => setPromoChoice(e.target.value === "__auto" ? null : e.target.value)}>
                                <option value="__auto">Best automatic</option>
                                <option value="">No promotion</option>
                                {promos.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                              </Select>
                            </div>
                            {promoErr && promoChoice && <p className="text-xs text-[#c24f69]">Promotion not applied: {promoErr}</p>}
                            {can("price.override") && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted">Manual discount <span className="text-xs">(logged)</span></span>
                                <Input type="number" className="h-8 w-24 text-right" min={0} value={manual} onChange={(e) => setManual(e.target.value)} />
                              </div>
                            )}
                            {(c?.points ?? 0) > 0 && gross > 0 && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted">Redeem points <span className="text-xs">({c?.points} available)</span></span>
                                <Input type="number" className="h-8 w-24 text-right" min={0} value={points || ""} onChange={(e) => setPoints(Math.max(0, Number(e.target.value)))} />
                              </div>
                            )}
                            {manualAmt > 0 && <Row l="Manual discount" r={<span className="text-[#2f8f72]">-{money(manualAmt)}</span>} />}
                            {loyalty > 0 && <Row l="Loyalty points" r={<span className="text-[#2f8f72]">-{money(loyalty)}</span>} />}
                          </div>
                        </div>
                        <div className="mt-3 border-t border-line pt-3">
                          <div className="text-xs text-muted">Amount to collect · {minsToLabel(stay)}</div>
                          <div className="font-display text-3xl font-semibold tabular">{money(due)}</div>
                        </div>
                        {due > 0 && (
                          <div className="mt-3">
                            <PaymentPicker method={method} onMethod={setMethod} total={due} tendered={tendered} onTendered={setTendered} walletBalance={c?.wallet} />
                          </div>
                        )}
                        <Button size="lg" variant={due > 0 ? "primary" : "success"} className="mt-4 w-full" disabled={busy} onClick={() => doCheckout(due, loyalty, manualAmt)}>
                          {due > 0 ? `Collect ${money(due)} & check out` : "Check out"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>
      </div>

      <Card
        className="mt-6"
        pad={false}
        title={`On the floor now · ${active.reduce((a, x) => a + x.t.visitors, 0)} visitors · ${money(active.reduce((a, x) => a + (x.line.q?.total ?? 0), 0))} so far`}
        action={<Tabs value={zoneF} onChange={setZoneF} items={[{ value: "all", label: "All" }, ...zones.filter((z) => z.kind !== "party").map((z) => ({ value: z.id, label: z.kind === "cowork" ? "Co-work" : z.name.replace(" Area", "") }))]} />}
      >
        <Table head={["Ticket", "Guardian", "Kids / people", "Area", "In", "Time so far", "Due now", ""]}>
          {active.map(({ t, line }) => {
            const together = t.visitId ? tickets.filter((x) => x.visitId === t.visitId && x.id !== t.id && x.status === "active") : [];
            const mins = line.q?.minutes ?? Math.floor((now.getTime() - new Date(t.checkIn).getTime()) / 60000);
            return (
              <tr key={t.id}>
                <td className="font-mono text-xs font-bold">
                  {t.visitId ?? t.code}
                  {mins < 10 && <Badge tone="lilac" className="ml-2 font-sans">New</Badge>}
                </td>
                <td>{customers.find((c) => c.id === t.customerId)?.name}</td>
                <td className="text-muted">{t.childIds.length ? children.filter((k) => t.childIds.includes(k.id)).map((k) => k.name.split(" ")[0]).join(", ") : `${t.visitors} person(s)`}</td>
                <td>
                  {zoneName(t.zoneId)}
                  {together.length > 0 && <Badge tone="sky" className="ml-1.5">+ {together.map((x) => zoneName(x.zoneId)).join(", ")}</Badge>}
                </td>
                <td className="tabular">{fmtTime(t.checkIn)}</td>
                <td className={cx("tabular", mins >= 180 && "font-bold text-[#a37812]")}>{minsToLabel(mins)}</td>
                <td className="tabular font-bold">{line.q?.plan ? money(line.q.total) : <span className="text-xs font-normal text-[#a63a54]">no rate</span>}</td>
                <td className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => scan(t.visitId ?? t.code)}>
                    Check out
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {done && receipt && (
        <PrintModal open onClose={() => { setReceipt(false); refocusScan(); }} title={`Receipt · ${done[0].visitId ?? done[0].code}`} doc={() => ticketDoc(done)} autoPrint>
          <TicketReceipt tickets={done} />
        </PrintModal>
      )}
    </>
  );
}

function Row({ l, r }: { l: React.ReactNode; r: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{l}</span>
      <span className="text-right">{r}</span>
    </div>
  );
}

function Result({ tone, icon, title, text }: { tone: "rose" | "mint"; icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className={cx("flex gap-4 rounded-2xl border p-5", tone === "rose" ? "border-rose bg-rose-soft" : "border-mint bg-mint-soft")}>
      <div className={tone === "rose" ? "text-[#c24f69]" : "text-[#2f8f72]"}>{icon}</div>
      <div>
        <div className="font-display text-lg font-semibold">{title}</div>
        <p className="text-sm text-ink/75">{text}</p>
      </div>
    </div>
  );
}
