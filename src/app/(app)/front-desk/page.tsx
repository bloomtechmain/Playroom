"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, Clock3, Lock, MessageCircle } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { useOccupancy, useNow } from "@/lib/hooks";
import type { RatePlan, Ticket, Zone } from "@/lib/types";
import { ageOf, cx, fmtTime, money, minsToLabel, timeToMin } from "@/lib/utils";
import { Badge, Button, Card, Counter, Meter, NoAccess, PageHeader, Select, SetupNeeded, Tabs, toast } from "@/components/ui";
import { CustomerPicker } from "@/components/CustomerPicker";
import { EntryTicket, PrintModal } from "@/components/Receipts";
import { entryTicketDoc } from "@/lib/receiptDocs";
import { QRCodeSVG } from "qrcode.react";

type Area = "play" | "cowork" | "both";

export default function FrontDesk() {
  const can = useCan();
  const zones = useStore((s) => s.zones);
  if (!can("tickets.sell")) return <NoAccess what="ticket sales" />;
  // walk-ins go to play / co-work zones; the party room is booked, not checked into at the desk
  const playZones = zones.filter((z) => z.active && z.kind === "play");
  const coworkZones = zones.filter((z) => z.active && z.kind === "cowork");
  if (!playZones.length && !coworkZones.length)
    return (
      <>
        <PageHeader title="Front Desk" subtitle="Check families in and print the entry ticket. The time is charged when they leave." />
        <SetupNeeded title="No zones to check visitors into yet" hint="Add a play area (or co-work lounge) with its capacity and opening hours, then give it at least one rate in Pricing." href="/zones" cta="Go to Zones & Capacity" />
      </>
    );
  return <Desk playZones={playZones} coworkZones={coworkZones} />;
}

function Desk({ playZones, coworkZones }: { playZones: Zone[]; coworkZones: Zone[] }) {
  const plans = useStore((s) => s.ratePlans);
  const customers = useStore((s) => s.customers);
  const children = useStore((s) => s.children);
  const checkIn = useStore((s) => s.checkIn);
  const occ = useOccupancy();
  const now = useNow(20000);

  const [customerId, setCustomerId] = useState<string>();
  const [area, setArea] = useState<Area>(playZones.length ? "play" : "cowork");
  const [playZoneId, setPlayZoneId] = useState(playZones[0]?.id ?? "");
  const [coworkZoneId, setCoworkZoneId] = useState(coworkZones[0]?.id ?? "");
  const [kidIds, setKidIds] = useState<string[]>([]);
  const [adults, setAdults] = useState(1);
  const [people, setPeople] = useState(1);
  const [issued, setIssued] = useState<Ticket[] | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [digital, setDigital] = useState(false);

  const options = [
    playZones.length ? { value: "play" as const, label: "Play area" } : null,
    coworkZones.length ? { value: "cowork" as const, label: "Co-work" } : null,
    playZones.length && coworkZones.length ? { value: "both" as const, label: "Play + Co-work" } : null,
  ].filter((o) => !!o);

  const playZone = area !== "cowork" ? playZones.find((z) => z.id === playZoneId) ?? playZones[0] : undefined;
  const coworkZone = area !== "play" ? coworkZones.find((z) => z.id === coworkZoneId) ?? coworkZones[0] : undefined;
  const chosen = [playZone, coworkZone].filter((z): z is Zone => !!z);

  const customer = customers.find((c) => c.id === customerId);
  const kids = children.filter((k) => k.guardianId === customerId);
  const childAges = kids.filter((k) => kidIds.includes(k.id)).map((k) => ageOf(k.dob));
  const mins = now.getHours() * 60 + now.getMinutes();

  const visitorsIn = (z: Zone) => (z.kind === "play" ? kidIds.length : people);
  const problems = chosen.flatMap((z) => {
    const o = occ.find((x) => x.zone.id === z.id)!;
    const out: string[] = [];
    if (o.locked) out.push(`${z.name} is locked for exclusive party ${o.lock?.ref} until ${o.lock?.end}`);
    else if (visitorsIn(z) > o.available) out.push(o.available === 0 ? `${z.name} is at full capacity` : `Only ${o.available} spot(s) left in ${z.name}`);
    if (!plans.some((p) => p.zoneId === z.id && p.active)) out.push(`${z.name} has no rates yet — add one in Pricing before checking visitors in`);
    return out;
  });
  const missing = !customer ? "Pick a family first" : playZone && kidIds.length < 1 ? "Select the children who are playing" : coworkZone && people < 1 ? "How many people are working?" : null;

  const selectCustomer = (id: string | undefined) => {
    setCustomerId(id);
    setKidIds(children.filter((k) => k.guardianId === id).map((k) => k.id));
  };

  const issue = async () => {
    if (!customer || issuing) return;
    if (missing) return toast(missing, "err");
    if (problems.length) return toast(problems[0], "err");
    setIssuing(true);
    const tickets = await checkIn({
      customerId: customer.id,
      childIds: playZone ? kidIds : [],
      adults: playZone ? adults : 0,
      areas: chosen.map((z) => ({ zoneId: z.id, visitors: visitorsIn(z) })),
    });
    setIssuing(false);
    if (!tickets) return;
    setIssued(tickets);
    toast(`${tickets[0].code} checked in at ${fmtTime(tickets[0].checkIn)} — pay at exit`);
  };

  const reset = () => {
    setIssued(null);
    selectCustomer(undefined);
    setDigital(false);
  };

  return (
    <>
      <PageHeader title="Front Desk" subtitle="Check families in and print the entry ticket. The time is charged when they leave." />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card title={<Step n={1} t="Who's visiting?" />}>
            <CustomerPicker value={customerId} onChange={selectCustomer} />
          </Card>

          <Card title={<Step n={2} t="Where are they going?" />}>
            {options.length > 1 && (
              <div className="mb-4">
                <Tabs value={area} onChange={setArea} items={options} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {chosen.map((z) => {
                const o = occ.find((x) => x.zone.id === z.id)!;
                const same = z.kind === "play" ? playZones : coworkZones;
                return (
                  <div key={z.id} className="rounded-2xl border-2 border-navy bg-sky-soft/50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      {same.length > 1 ? (
                        <Select className="h-9" value={z.id} onChange={(e) => (z.kind === "play" ? setPlayZoneId(e.target.value) : setCoworkZoneId(e.target.value))}>
                          {same.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </Select>
                      ) : (
                        <span className="font-display text-lg font-medium">{z.name}</span>
                      )}
                      {o.locked ? <Badge tone="rose"><Lock size={11} /> Locked</Badge> : o.full ? <Badge tone="rose">Full</Badge> : o.nearFull ? <Badge tone="sun">Nearly full</Badge> : <Badge tone="mint">Open</Badge>}
                    </div>
                    <div className="mt-2">
                      <Meter value={o.inside} max={z.capacity} warnAt={z.nearFullPct / 100} />
                    </div>
                    <div className="mt-1.5 text-xs text-muted tabular">
                      {o.inside} inside · {o.available} free · {z.openTime}–{z.closeTime}
                    </div>
                    <RateLine plans={plans.filter((p) => p.zoneId === z.id && p.active)} unit={z.kind === "play" ? "child" : "person"} />
                    {(mins < timeToMin(z.openTime) || mins >= timeToMin(z.closeTime)) && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#8a6510]"><AlertTriangle size={13} /> Outside opening hours</p>
                    )}
                    {z.rules && <p className="mt-2 text-xs text-muted"><b>Entry rules:</b> {z.rules}</p>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title={<Step n={3} t="How many?" />}>
            {!customer && <p className="text-sm text-muted">Pick a family first.</p>}
            {customer && playZone && (
              <div>
                <div className="mb-2 text-sm font-bold">{playZone.name} — who&apos;s playing?</div>
                <div className="flex flex-wrap gap-2">
                  {kids.map((k) => {
                    const on = kidIds.includes(k.id);
                    return (
                      <button
                        key={k.id}
                        onClick={() => setKidIds(on ? kidIds.filter((x) => x !== k.id) : [...kidIds, k.id])}
                        className={cx("flex items-center gap-2 rounded-full border-2 py-1.5 pl-1.5 pr-3.5 text-sm font-bold", on ? "border-mint bg-mint-soft" : "border-line bg-white text-muted")}
                      >
                        <span className={cx("grid h-6 w-6 place-items-center rounded-full", on ? "bg-[#3aa985] text-white" : "bg-[#efeae1]")}>{on && <Check size={14} />}</span>
                        {k.name.split(" ")[0]} <span className="font-normal text-muted">{ageOf(k.dob)}y</span>
                        {k.allergies && <span className="rounded bg-rose-soft px-1 text-[10px] text-[#c24f69]">{k.allergies}</span>}
                      </button>
                    );
                  })}
                  {kids.length === 0 && <p className="text-sm text-muted">No children on file — add them from the customer profile.</p>}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-sm font-bold">Accompanying adults</span>
                  <Counter value={adults} onChange={setAdults} min={0} max={6} />
                  <span className="text-xs text-muted">free entry, counted for safety</span>
                </div>
                {childAges.some((a) => (playZone.minAge != null && a < playZone.minAge) || (playZone.maxAge != null && a > playZone.maxAge)) && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-[#a37812]">
                    <AlertTriangle size={15} /> One or more children are outside the {playZone.minAge}–{playZone.maxAge} age range for this zone.
                  </p>
                )}
              </div>
            )}
            {customer && coworkZone && (
              <div className={cx(playZone && "mt-5 border-t border-dashed border-line pt-4")}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{coworkZone.name} — people working</span>
                  <Counter value={people} onChange={setPeople} min={1} max={10} />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* summary */}
        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          <Card title="Check-in">
            {!customer ? (
              <p className="text-sm text-muted">Pick a family to check in.</p>
            ) : (
              <>
                <div className="font-display text-lg font-medium">{customer.name}</div>
                <div className="mt-2 space-y-1.5 text-sm">
                  {chosen.map((z) => (
                    <div key={z.id} className="flex justify-between gap-3">
                      <span className="text-muted">{z.name}</span>
                      <span>{z.kind === "play" ? `${kidIds.length} kid${kidIds.length === 1 ? "" : "s"}${adults ? ` + ${adults} adult${adults === 1 ? "" : "s"}` : ""}` : `${people} ${people === 1 ? "person" : "people"}`}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-sky-soft px-3 py-2.5 text-sm text-[#3570ad]">
                  <Clock3 size={16} /> Start time <b className="tabular">{fmtTime(now)}</b> — recorded when you check in
                </div>
                <p className="mt-3 rounded-xl bg-mint-soft px-3 py-2 text-xs text-[#2f8f72]">
                  Nothing to pay now. At check-out the time actually spent is charged at the best rate (cash, card, LankaQR, transfer or wallet{customer.points > 0 ? `, or ${customer.points} loyalty points` : ""}).
                </p>
                {problems.map((p) => (
                  <p key={p} className="mt-3 rounded-xl bg-rose-soft px-3 py-2 text-sm font-bold text-[#a63a54]">{p}</p>
                ))}
                <Button size="lg" className="mt-4 w-full" disabled={!!missing || problems.length > 0 || issuing} onClick={issue}>
                  Check in & print ticket
                </Button>
              </>
            )}
          </Card>
        </div>
      </div>

      {issued && (
        <PrintModal
          open
          onClose={reset}
          title={digital ? "Digital ticket" : "Ticket issued"}
          doc={() => entryTicketDoc(issued[0])}
          autoPrint
          extra={
            <Button variant="ghost" icon={<MessageCircle size={16} />} onClick={() => { setDigital(!digital); }}>
              {digital ? "Thermal view" : "Digital ticket"}
            </Button>
          }
        >
          {digital ? <DigitalTicket t={issued[0]} /> : <EntryTicket t={issued[0]} />}
        </PrintModal>
      )}
    </>
  );
}

/** "1 Hour Rs 1,500 · 2 Hours Rs 2,500 · then Rs 300 / 15 min" — what the stay will be charged with. */
function RateLine({ plans, unit }: { plans: RatePlan[]; unit: string }) {
  if (!plans.length)
    return (
      <p className="mt-2 text-xs text-[#8a6510]">
        No rates yet — add one in <Link href="/pricing" className="font-bold underline">Pricing → Rate plans</Link>.
      </p>
    );
  const sorted = [...plans].sort((a, b) => a.minutes - b.minutes);
  const longest = sorted[sorted.length - 1];
  return (
    <p className="mt-2 text-xs text-muted">
      Charged on exit per {unit}: {sorted.map((p) => `${minsToLabel(p.minutes)} ${money(p.price)}`).join(" · ")}
      {longest.overtimePrice > 0 && ` · then ${money(longest.overtimePrice)} / ${longest.overtimeBlock} min`}
    </p>
  );
}

function DigitalTicket({ t }: { t: Ticket }) {
  const c = useStore((s) => s.customers.find((x) => x.id === t.customerId));
  const business = useStore((s) => s.settings.businessName);
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
      <div className="bg-sky-soft px-5 pb-4 pt-5 text-center">
        <div className="font-display text-xl font-semibold text-navy">{business}</div>
        <div className="text-xs text-muted">Show this QR at the exit</div>
      </div>
      <div className="p-5 text-center">
        <QRCodeSVG value={t.code} size={170} fgColor="#24395f" className="mx-auto" />
        <div className="mt-2 font-mono text-xs text-muted">{t.code}</div>
        <div className="mt-3 text-xs text-muted">IN</div>
        <div className="font-display text-2xl font-semibold">{fmtTime(t.checkIn)}</div>
      </div>
      <div className="border-t border-dashed border-line px-5 py-3 text-center text-xs text-muted">
        Sent by SMS & WhatsApp to {c?.phone}
      </div>
    </div>
  );
}

function Step({ n, t }: { n: number; t: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-navy font-display text-xs text-white">{n}</span>
      {t}
    </span>
  );
}
