"use client";

import { useMemo, useState } from "react";
import { Lock, Pencil, Plus } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore, useCan } from "@/lib/store";
import { useOccupancy } from "@/lib/hooks";
import { BLOCK_MINUTES, zoneRate } from "@/lib/pricing";
import type { RatePlan, Zone } from "@/lib/types";
import { cx, money, today, uid } from "@/lib/utils";
import { localDay } from "@/lib/accounting";
import { Badge, Button, Card, Field, Input, Meter, Modal, NoAccess, PageHeader, Select, Textarea, Toggle, toast, toneCls, type Tone } from "@/components/ui";

export default function ZonesPage() {
  const can = useCan();
  if (!can("zones.view")) return <NoAccess what="zones" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const occ = useOccupancy();
  const zones = useStore((s) => s.zones);
  const tickets = useStore((s) => s.tickets);
  const bookings = useStore((s) => s.bookings);
  const ratePlans = useStore((s) => s.ratePlans);
  const save = useStore((s) => s.save);
  const [edit, setEdit] = useState<Zone | null>(null);

  const hourly = useMemo(() => {
    const d = today();
    const rows = [];
    for (let h = 8; h <= 21; h++) {
      const t = new Date(`${d}T${String(h).padStart(2, "0")}:30:00`);
      const row: Record<string, number | string> = { hour: `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}` };
      for (const z of zones.filter((z) => z.kind !== "party")) {
        row[z.name] = tickets
          .filter((x) => x.zoneId === z.id && localDay(x.checkIn) === d && x.status !== "cancelled")
          .filter((x) => new Date(x.checkIn) <= t && (x.checkOut ? new Date(x.checkOut) > t : t <= new Date()))
          .reduce((a, x) => a + x.visitors, 0);
      }
      rows.push(row);
    }
    return rows;
  }, [tickets, zones]);

  const lockouts = bookings.filter((b) => b.kind === "party" && b.mode === "full" && b.status === "confirmed" && b.date >= today()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Zones & Capacity"
        subtitle="Each zone runs on its own capacity, hours and alert threshold."
        actions={can("zones.edit") && <Button icon={<Plus size={16} />} onClick={() => setEdit({ id: "", name: "", kind: "play", capacity: 20, nearFullPct: 80, openTime: "09:00", closeTime: "20:00", rules: "", active: true, color: "teal" })}>Add zone</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {occ.map((o) => {
          const t = toneCls[(o.zone.color as Tone) ?? "sky"];
          return (
            <Card key={o.zone.id} className={cx(!o.zone.active && "opacity-60")}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={cx("h-10 w-2 rounded-full", t.dot)} />
                  <div>
                    <div className="font-display text-lg font-medium">{o.zone.name}</div>
                    <div className="text-xs capitalize text-muted">{o.zone.kind === "cowork" ? "Co-working" : o.zone.kind} · {o.zone.openTime}–{o.zone.closeTime}</div>
                  </div>
                </div>
                {can("zones.edit") && (
                  <button onClick={() => setEdit(o.zone)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy">
                    <Pencil size={15} />
                  </button>
                )}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div className="font-display text-4xl font-semibold tabular">
                  {o.inside}<span className="text-xl text-muted">/{o.zone.capacity}</span>
                </div>
                <div className="text-right">
                  {o.locked ? <Badge tone="rose"><Lock size={11} /> Locked</Badge> : o.full ? <Badge tone="rose">Full — entry blocked</Badge> : o.nearFull ? <Badge tone="sun">Near full</Badge> : <Badge tone="mint">Accepting</Badge>}
                  <div className="mt-1 text-xs text-muted">{Math.round(o.pct * 100)}% · alert at {o.zone.nearFullPct}%</div>
                </div>
              </div>
              <div className="mt-3">
                <Meter value={o.inside} max={o.zone.capacity} warnAt={o.zone.nearFullPct / 100} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-muted">Price</dt>
                <dd className="text-right">{o.zone.kind === "party" ? "Package based" : rateLabel(zoneRate(ratePlans, o.zone.id))}</dd>
                {o.zone.minAge != null && (
                  <>
                    <dt className="text-muted">Ages</dt>
                    <dd className="text-right">{o.zone.minAge}–{o.zone.maxAge} years</dd>
                  </>
                )}
              </dl>
              {o.zone.rules && <p className="mt-3 rounded-xl bg-[#faf7f1] px-3 py-2 text-xs text-ink/75">{o.zone.rules}</p>}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card title="Occupancy through today">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <AreaChart data={hourly}>
                <CartesianGrid vertical={false} stroke="#f0ebe2" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#8a92a5" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#8a92a5" }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ebe5da" }} />
                {zones.filter((z) => z.kind !== "party").map((z, i) => (
                  <Area key={z.id} type="monotone" dataKey={z.name} stroke={["#5f97d3", "#4fb79a", "#9b84c9"][i % 3]} fill={["#93bfea", "#8bd4bd", "#b9a3dc"][i % 3]} fillOpacity={0.35} strokeWidth={2} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Upcoming play-area lockouts" pad={false}>
          <p className="px-5 pt-4 text-xs text-muted">Full-venue parties close the Kids Play Area to walk-ins and online play bookings, from 30 min before start.</p>
          <div className="mt-2">
            {lockouts.length === 0 && <p className="p-5 text-sm text-muted">None scheduled.</p>}
            {lockouts.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-t border-[#f2eee6] px-5 py-2.5 text-sm">
                <span><b>{b.date === today() ? "Today" : b.date}</b> · {b.start}–{b.end}</span>
                <span className="text-xs text-muted">{b.ref}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {edit && (
        <ZoneForm
          zone={edit}
          onClose={() => setEdit(null)}
          onSave={(z) => {
            const isNew = !z.id;
            const item = isNew ? { ...z, id: uid("z-") } : z;
            save("zones", item, "Zones", `${isNew ? "Added" : "Edited"} zone ${item.name}`);
            toast("Zone saved");
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

/** The zone's price as set in Pricing → Rate plans. */
function rateLabel(plan: RatePlan | undefined) {
  if (!plan) return <span className="text-muted">No rate — set one in Pricing</span>;
  return `${money(plan.price)} / ${BLOCK_MINUTES} min`;
}

function ZoneForm({ zone, onClose, onSave }: { zone: Zone; onClose: () => void; onSave: (z: Zone) => void }) {
  const [z, setZ] = useState(zone);
  const set = <K extends keyof Zone>(k: K, v: Zone[K]) => setZ({ ...z, [k]: v });
  return (
    <Modal
      open
      onClose={onClose}
      title={zone.id ? `Edit ${zone.name}` : "New zone"}
      width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => z.name.trim() && onSave(z)}>Save zone</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Zone name"><Input value={z.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Type">
          <Select value={z.kind} onChange={(e) => set("kind", e.target.value as Zone["kind"])}>
            <option value="play">Play area</option>
            <option value="party">Party / event room</option>
            <option value="cowork">Co-working</option>
          </Select>
        </Field>
        <Field label="Maximum capacity"><Input type="number" value={z.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></Field>
        <Field label="Near-full alert at (%)"><Input type="number" value={z.nearFullPct} onChange={(e) => set("nearFullPct", Number(e.target.value))} /></Field>
        <Field label="Opens"><Input type="time" value={z.openTime} onChange={(e) => set("openTime", e.target.value)} /></Field>
        <Field label="Closes"><Input type="time" value={z.closeTime} onChange={(e) => set("closeTime", e.target.value)} /></Field>
        <Field label="Colour">
          <Select value={z.color} onChange={(e) => set("color", e.target.value)}>
            {["sky", "lilac", "mint", "rose", "sun", "teal"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Min age"><Input type="number" value={z.minAge ?? ""} onChange={(e) => set("minAge", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
        <Field label="Max age"><Input type="number" value={z.maxAge ?? ""} onChange={(e) => set("maxAge", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
        <Field label="Special entry rules" className="sm:col-span-2"><Textarea value={z.rules} onChange={(e) => set("rules", e.target.value)} /></Field>
        <Toggle checked={z.active} onChange={(v) => set("active", v)} label="Zone is active" />
      </div>
    </Modal>
  );
}
