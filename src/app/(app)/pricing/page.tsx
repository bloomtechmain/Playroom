"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { BLOCK_MINUTES, blocksFor, stayQuote, zoneRate } from "@/lib/pricing";
import type { PriceRule, Promotion, RatePlan } from "@/lib/types";
import { cx, minsToLabel, money, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, SetupNeeded, Table, Tabs, Toggle, toast, type Tone } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND_TONE: Record<PriceRule["kind"], Tone> = { weekday: "sky", weekend: "lilac", peak: "rose", offpeak: "mint", holiday: "sun", event: "teal" };
const PROMO_LABEL: Record<Promotion["type"], string> = { percent: "% off", fixed: "Fixed off", package: "Package price", bonus_time: "Bonus time" };

export default function PricingPage() {
  const can = useCan();
  if (!can("pricing.edit") && !can("promotions.edit")) return <NoAccess what="pricing" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const [tab, setTab] = useState<"rates" | "rules" | "promos" | "holidays" | "check">(can("pricing.edit") ? "rates" : "promos");
  return (
    <>
      <PageHeader title="Pricing & Promotions" subtitle="Rates, day/time rules, holidays and promotion campaigns — all applied automatically at the front desk." />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ...(can("pricing.edit") ? [{ value: "rates" as const, label: "Rate plans" }, { value: "rules" as const, label: "Day & time rules" }, { value: "holidays" as const, label: "Holidays" }] : []),
            { value: "promos", label: "Promotions" },
            { value: "check", label: "Price checker" },
          ]}
        />
      </div>
      {tab === "rates" && <Rates />}
      {tab === "rules" && <Rules />}
      {tab === "promos" && <Promos />}
      {tab === "holidays" && <Holidays />}
      {tab === "check" && <Checker />}
    </>
  );
}

function Rates() {
  const zones = useStore((s) => s.zones);
  const plans = useStore((s) => s.ratePlans);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const [edit, setEdit] = useState<RatePlan | null>(null);
  const zoneOf = (id: string) => zones.find((z) => z.id === id);
  const per = (zoneId: string) => (zoneOf(zoneId)?.kind === "play" ? "child" : "person");
  return (
    <>
      <p className="mb-4 rounded-xl bg-sky-soft px-4 py-2.5 text-sm text-[#3570ad]">
        Each zone has one price per {BLOCK_MINUTES} minutes. At check-out the time actually spent is rounded up to the next {BLOCK_MINUTES} minutes — {BLOCK_MINUTES} minutes is the minimum, and a 1h 20m stay is charged as 1h 30m.
      </p>
      {!zones.some((z) => z.kind !== "party") && <SetupNeeded title="No zones to price yet" hint="Rates belong to a play area or co-work zone. Add one first; party rooms are priced through party packages." href="/zones" cta="Go to Zones & Capacity" />}
      <div className="grid gap-5 lg:grid-cols-2">
        {zones.filter((z) => z.kind !== "party").map((z) => {
          const rate = plans.find((p) => p.zoneId === z.id);
          return (
            <Card
              key={z.id}
              title={z.name}
              action={rate
                ? <Button size="sm" variant="soft" icon={<Pencil size={14} />} onClick={() => setEdit(rate)}>Edit rate</Button>
                : <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setEdit({ id: "", zoneId: z.id, price: 0, active: true })}>Add rate</Button>}
            >
              {rate ? (
                <>
                  <div className="font-display text-2xl font-semibold tabular">{money(rate.price)} <span className="text-sm font-normal text-muted">per {BLOCK_MINUTES} min, per {per(z.id)}</span></div>
                  <RateExamples price={rate.price} />
                </>
              ) : (
                <p className="text-sm text-muted">No rate yet — visitors can&apos;t be checked out of this zone until it has one.</p>
              )}
            </Card>
          );
        })}
      </div>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={`${edit.id ? "Edit" : "New"} rate · ${zoneOf(edit.zoneId)?.name ?? ""}`}
          footer={
            <>
              {edit.id && <Button variant="ghost" className="mr-auto text-[#c24f69]" onClick={() => { remove("ratePlans", edit.id, "Pricing", `Rate ${zoneOf(edit.zoneId)?.name ?? ""}`); setEdit(null); }}>Delete</Button>}
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button disabled={!(edit.price > 0)} onClick={() => { const item = edit.id ? edit : { ...edit, id: uid("rp") }; save("ratePlans", item, "Pricing", `Rate ${zoneOf(item.zoneId)?.name ?? ""} · ${money(item.price)} / ${BLOCK_MINUTES} min`); toast("Rate saved"); setEdit(null); }}>Save</Button>
            </>
          }
        >
          <Field label={`Price per ${BLOCK_MINUTES} minutes, per ${per(edit.zoneId)} (Rs.)`}>
            <Input type="number" min={0} autoFocus value={edit.price || ""} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} />
          </Field>
          {edit.price > 0 && <RateExamples price={edit.price} />}
        </Modal>
      )}
    </>
  );
}

/** What a few typical stays cost at this rate, for one visitor. */
function RateExamples({ price }: { price: number }) {
  return (
    <p className="mt-2 text-xs text-muted">
      {[20, 60, 80, 150].map((m) => `${minsToLabel(m)} → ${minsToLabel(blocksFor(m) * BLOCK_MINUTES)} = ${money(blocksFor(m) * price)}`).join(" · ")}
    </p>
  );
}

function Rules() {
  const rules = useStore((s) => s.rules);
  const zones = useStore((s) => s.zones);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const [edit, setEdit] = useState<PriceRule | null>(null);
  return (
    <>
      <Card pad={false} title="Dynamic price rules" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ id: "", name: "", kind: "peak", days: [6, 0], start: "10:00", end: "14:00", adjust: "percent", value: 10, zoneIds: zones.filter((z) => z.kind === "play").map((z) => z.id), active: true })}>New rule</Button>}>
        <Table head={["Rule", "Type", "When", "Adjustment", "Zones", "Active", ""]}>
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="font-bold">{r.name}</td>
              <td><Badge tone={KIND_TONE[r.kind]}><span className="capitalize">{r.kind === "offpeak" ? "Off-peak" : r.kind}</span></Badge></td>
              <td className="text-muted">
                {r.kind === "holiday" ? "Any listed holiday" : r.kind === "event" ? r.date : r.days.map((d) => DAYS[d]).join(", ")}
                <span className="ml-1 tabular">· {r.start}–{r.end}</span>
              </td>
              <td className={cx("tabular font-bold", r.value < 0 ? "text-[#2f8f72]" : "text-[#c24f69]")}>
                {r.value > 0 ? "+" : ""}{r.adjust === "percent" ? `${r.value}%` : `${money(r.value)} / visitor`}
              </td>
              <td className="text-muted">{r.zoneIds.map((z) => zones.find((x) => x.id === z)?.name.split(" ")[0]).join(", ") || "All"}</td>
              <td><Toggle checked={r.active} onChange={(v) => save("rules", { ...r, active: v }, "Pricing", `Rule ${r.name}`)} /></td>
              <td className="text-right"><button onClick={() => setEdit(r)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={14} /></button></td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted">Rules stack in order. Weekday/weekend rules are skipped on holidays so the holiday rate applies instead.</p>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? "Edit rule" : "New rule"}
          width="max-w-xl"
          footer={
            <>
              {edit.id && <Button variant="ghost" className="mr-auto text-[#c24f69]" onClick={() => { remove("rules", edit.id, "Pricing", `Rule ${edit.name}`); setEdit(null); }}>Delete</Button>}
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={() => { const item = edit.id ? edit : { ...edit, id: uid("pr") }; save("rules", item, "Pricing", `Rule ${item.name}`); toast("Rule saved"); setEdit(null); }}>Save</Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as PriceRule["kind"] })}>
                <option value="weekday">Weekday</option>
                <option value="weekend">Weekend</option>
                <option value="peak">Peak</option>
                <option value="offpeak">Off-peak</option>
                <option value="holiday">Holiday</option>
                <option value="event">Special event</option>
              </Select>
            </Field>
            {edit.kind === "event" ? (
              <Field label="Event date"><Input type="date" value={edit.date ?? ""} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            ) : edit.kind !== "holiday" ? (
              <div>
                <span className="mb-1 block text-[13px] font-bold text-ink/80">Days</span>
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, i) => (
                    <button key={d} onClick={() => setEdit({ ...edit, days: edit.days.includes(i) ? edit.days.filter((x) => x !== i) : [...edit.days, i] })} className={cx("rounded-lg px-2 py-1.5 text-xs font-bold", edit.days.includes(i) ? "bg-navy text-white" : "bg-[#f3efe8] text-muted")}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            ) : <div />}
            <Field label="From"><Input type="time" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
            <Field label="Until"><Input type="time" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            <Field label="Adjust by">
              <Select value={edit.adjust} onChange={(e) => setEdit({ ...edit, adjust: e.target.value as PriceRule["adjust"] })}>
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed Rs. per visitor</option>
              </Select>
            </Field>
            <Field label="Value" hint="Positive = surcharge, negative = discount"><Input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-[13px] font-bold text-ink/80">Applies to zones</span>
              <div className="flex flex-wrap gap-3">
                {zones.filter((z) => z.kind !== "party").map((z) => (
                  <label key={z.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={edit.zoneIds.includes(z.id)} onChange={(e) => setEdit({ ...edit, zoneIds: e.target.checked ? [...edit.zoneIds, z.id] : edit.zoneIds.filter((x) => x !== z.id) })} />
                    {z.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Promos() {
  const can = useCan();
  const promos = useStore((s) => s.promotions);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const zones = useStore((s) => s.zones);
  const [edit, setEdit] = useState<Promotion | null>(null);
  const d = today();
  const targeting = (p: Promotion) => {
    const t = p.targeting;
    const out: string[] = [];
    if (t.membersOnly) out.push("Members");
    if (t.minSpend) out.push(`Spend ≥ ${money(t.minSpend)}`);
    if (t.minVisitors) out.push(`${t.minVisitors}+ visitors`);
    if (t.childMinAge != null || t.childMaxAge != null) out.push(`Age ${t.childMinAge ?? 0}–${t.childMaxAge ?? "+"}`);
    if (t.minPriorVisits) out.push(`${t.minPriorVisits}+ prior visits`);
    return out.join(" · ") || "Everyone";
  };
  return (
    <>
      <div className="mb-4 flex justify-end">
        {can("promotions.edit") && <Button icon={<Plus size={16} />} onClick={() => setEdit({ id: "", code: "", name: "", type: "percent", value: 10, validFrom: d, validTo: d, usageCap: 100, used: 0, auto: false, active: true, zoneIds: [], targeting: {} })}>New promotion</Button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {promos.map((p) => {
          const live = p.active && p.validFrom <= d && p.validTo >= d && (!p.usageCap || p.used < p.usageCap);
          const expired = p.validTo < d;
          return (
            <Card key={p.id} className={cx(!live && "opacity-70")}>
              <div className="flex items-start justify-between">
                <span className="rounded-lg border border-dashed border-[#d9b75a] bg-sun-soft px-2 py-0.5 font-mono text-sm font-bold text-[#8a6510]">{p.code}</span>
                {live ? <Badge tone="mint">Running</Badge> : expired ? <Badge tone="gray">Expired</Badge> : p.usageCap && p.used >= p.usageCap ? <Badge tone="rose">Cap reached</Badge> : <Badge tone="gray">Paused</Badge>}
              </div>
              <div className="mt-3 font-display text-lg font-medium">{p.name}</div>
              <div className="text-sm text-muted">
                {PROMO_LABEL[p.type]} · {p.type === "percent" ? `${p.value}%` : p.type === "bonus_time" ? `+${p.value} min` : money(p.value)}
                {p.auto && " · auto-applied"}
              </div>
              <div className="mt-3 text-xs text-ink/70">
                <div><b>Who:</b> {targeting(p)}</div>
                <div><b>Where:</b> {p.zoneIds.map((z) => zones.find((x) => x.id === z)?.name).join(", ") || "All zones"}</div>
                <div><b>Valid:</b> {p.validFrom} → {p.validTo}</div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted"><span>{p.used} used</span><span>{p.usageCap ? `cap ${p.usageCap}` : "no cap"}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-[#f1ece3]"><div className="h-1.5 rounded-full bg-lilac" style={{ width: `${p.usageCap ? Math.min(100, (p.used / p.usageCap) * 100) : 8}%` }} /></div>
              </div>
              {can("promotions.edit") && (
                <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
                  <Toggle checked={p.active} onChange={(v) => save("promotions", { ...p, active: v }, "Promotions", `${p.code}`)} label={<span className="text-xs text-muted">Active</span>} />
                  <div className="flex-1" />
                  <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>Edit</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? `Edit ${edit.code}` : "New promotion"}
          width="max-w-2xl"
          footer={
            <>
              {edit.id && <Button variant="ghost" className="mr-auto text-[#c24f69]" icon={<Trash2 size={14} />} onClick={() => { remove("promotions", edit.id, "Promotions", edit.code); setEdit(null); }}>Delete</Button>}
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={() => { if (!edit.code || !edit.name) return toast("Code and name are required", "err"); const item = edit.id ? edit : { ...edit, id: uid("pm"), code: edit.code.toUpperCase() }; save("promotions", item, "Promotions", item.code); toast("Promotion saved"); setEdit(null); }}>Save</Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Promotion["type"] })}>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
                <option value="package">Package price</option>
                <option value="bonus_time">Free bonus time</option>
              </Select>
            </Field>
            <Field label={edit.type === "percent" ? "Percent" : edit.type === "bonus_time" ? "Bonus minutes" : edit.type === "package" ? "Package price (Rs.)" : "Amount (Rs.)"}>
              <Input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} />
            </Field>
            {edit.type === "package" && <Field label="Visitors in package"><Input type="number" value={edit.packageKids ?? ""} onChange={(e) => setEdit({ ...edit, packageKids: Number(e.target.value) || undefined })} /></Field>}
            <Field label="Valid from"><Input type="date" value={edit.validFrom} onChange={(e) => setEdit({ ...edit, validFrom: e.target.value })} /></Field>
            <Field label="Valid to"><Input type="date" value={edit.validTo} onChange={(e) => setEdit({ ...edit, validTo: e.target.value })} /></Field>
            <Field label="Usage cap" hint="0 = unlimited"><Input type="number" value={edit.usageCap} onChange={(e) => setEdit({ ...edit, usageCap: Number(e.target.value) })} /></Field>
            <div className="flex items-end gap-5 pb-2">
              <Toggle checked={edit.auto} onChange={(v) => setEdit({ ...edit, auto: v })} label="Auto-apply" />
              <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" />
            </div>
            <div className="rounded-xl bg-[#faf7f1] p-4 sm:col-span-2">
              <div className="mb-3 text-sm font-bold">Targeting rules</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {([["minSpend", "Min spend (Rs.)"], ["minVisitors", "Min visitors"], ["minPriorVisits", "Min prior visits"], ["childMinAge", "Child min age"], ["childMaxAge", "Child max age"]] as const).map(([k, l]) => (
                  <Field key={k} label={l}>
                    <Input type="number" value={edit.targeting[k] ?? ""} onChange={(e) => setEdit({ ...edit, targeting: { ...edit.targeting, [k]: e.target.value === "" ? undefined : Number(e.target.value) } })} />
                  </Field>
                ))}
                <div className="flex items-end pb-2"><Toggle checked={!!edit.targeting.membersOnly} onChange={(v) => setEdit({ ...edit, targeting: { ...edit.targeting, membersOnly: v } })} label="Members only" /></div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Holidays() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const list = [...settings.holidays].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card title="Public & Poya holidays" className="max-w-2xl" pad={false}>
      <div className="flex gap-2 p-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Input placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => { if (!date || !name) return; setSettings({ holidays: [...settings.holidays, { date, name }] }, `Added holiday ${name}`); setDate(""); setName(""); }}>Add</Button>
      </div>
      <Table head={["Date", "Holiday", ""]}>
        {list.map((h) => (
          <tr key={h.date + h.name}>
            <td className="tabular">{h.date}</td>
            <td>{h.name}</td>
            <td className="text-right"><button onClick={() => setSettings({ holidays: settings.holidays.filter((x) => x !== h) }, `Removed holiday ${h.name}`)} className="text-muted hover:text-[#c24f69]"><Trash2 size={14} /></button></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Checker() {
  const zones = useStore((s) => s.zones);
  const plans = useStore((s) => s.ratePlans);
  const priced = zones.filter((z) => z.kind !== "party" && plans.some((p) => p.zoneId === z.id));
  if (!priced.length) return <SetupNeeded title="Nothing to price yet" hint="Add a play or co-work zone, then give it a rate in the Rate plans tab — the checker shows what a visit would cost at any date and time." href="/zones" cta="Go to Zones & Capacity" />;
  return <PriceChecker initialZone={(priced.find((z) => z.kind === "play") ?? priced[0]).id} />;
}

function PriceChecker({ initialZone }: { initialZone: string }) {
  const zones = useStore((s) => s.zones);
  const plans = useStore((s) => s.ratePlans);
  const rules = useStore((s) => s.rules);
  const settings = useStore((s) => s.settings);
  const promos = useStore((s) => s.promotions);
  const [zoneId, setZoneId] = useState(initialZone);
  const [when, setWhen] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [stay, setStay] = useState(90);
  const [kids, setKids] = useState(2);
  const [member, setMember] = useState(false);
  // same choices as at check-out: best automatic promotion, none, or a specific one
  const [promoId, setPromoId] = useState<string | null>(null);
  const zone = zones.find((z) => z.id === zoneId)!;
  const checkIn = new Date(when);
  const q = stayQuote(
    { ticket: { zoneId, checkIn: checkIn.toISOString(), visitors: kids, adults: 1 }, zone, plan: zoneRate(plans, zoneId), childAges: [5], member, priorVisits: 3 },
    rules,
    settings,
    promos,
    new Date(checkIn.getTime() + stay * 60000),
    { promoChoice: promoId },
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Try a price">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zone"><Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>{zones.filter((z) => z.kind !== "party" && plans.some((p) => p.zoneId === z.id)).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
          <Field label="Checked in at"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Length of stay (minutes)" hint={minsToLabel(stay)}><Input type="number" min={1} value={stay} onChange={(e) => setStay(Math.max(1, Number(e.target.value)))} /></Field>
          <Field label="Visitors"><Input type="number" min={1} value={kids} onChange={(e) => setKids(Math.max(1, Number(e.target.value)))} /></Field>
          <Field label="Promotion">
            <Select value={promoId ?? "__auto"} onChange={(e) => setPromoId(e.target.value === "__auto" ? null : e.target.value)}>
              <option value="__auto">Best automatic</option>
              <option value="">None</option>
              {promos.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </Select>
          </Field>
          <div className="flex items-end pb-2"><Toggle checked={member} onChange={setMember} label="Member" /></div>
        </div>
      </Card>
      <Card title="Result">
        {!q.plan ? (
          <p className="text-sm text-muted">This zone has no rate yet.</p>
        ) : (
          <>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span>{minsToLabel(q.blocks * BLOCK_MINUTES)} ({q.blocks} × {money(q.plan.price)}) × {kids}</span><span className="tabular">{money(q.base)}</span></div>
              {q.applied.map((r) => <div key={r.id} className="flex justify-between text-muted"><span>{r.name}</span><span className="tabular">{r.adjust === "percent" ? `${r.value}%` : money(r.value * kids)}</span></div>)}
              {q.applied.length === 0 && <div className="text-muted">No day/time rules apply.</div>}
              {q.promoError && <div className="text-[#c24f69]">Promotion not applied: {q.promoError}</div>}
              {q.promo && <div className="flex justify-between text-[#2f8f72]"><span>{q.promo.code}</span><span>{q.discount ? `-${money(q.discount)}` : ""}{q.bonusMinutes ? ` ${q.bonusMinutes} min free` : ""}</span></div>}
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <div className="text-xs text-muted">Charged at check-out for a {minsToLabel(stay)} stay — rounded up to {minsToLabel(q.blocks * BLOCK_MINUTES)}</div>
              <div className="font-display text-4xl font-semibold tabular">{money(q.total)}</div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
