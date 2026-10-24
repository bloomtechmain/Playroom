"use client";

import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Lock, Pencil, Plus, Printer } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { Addon, Booking, PartyPackage, PayMethod } from "@/lib/types";
import { bookingConflict, partyPrice, toHHMM } from "@/lib/booking";
import { cx, money, timeToMin, today, uid, fmtDT } from "@/lib/utils";
import { Badge, Button, Card, Empty, Field, Input, Modal, NoAccess, PageHeader, Select, Table, Tabs, Textarea, Toggle, toast, Counter } from "@/components/ui";
import { CustomerPicker } from "@/components/CustomerPicker";
import { PaymentPicker } from "@/components/Payment";
import { BookingConfirmation, PrintModal } from "@/components/Receipts";
import { bookingDoc } from "@/lib/receiptDocs";
import RefundDialog from "@/components/RefundDialog";

export default function BookingsPage() {
  const can = useCan();
  if (!can("bookings.view")) return <NoAccess what="bookings" />;
  return <Inner />;
}

const STATUS_TONE = { pending: "sun", confirmed: "mint", completed: "sky", cancelled: "gray" } as const;

function Inner() {
  const can = useCan();
  const [tab, setTab] = useState<"calendar" | "list" | "packages">("calendar");
  const [creating, setCreating] = useState<{ date: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Bookings & Parties"
        subtitle="Master calendar for parties, full-venue hires and play reservations."
        actions={can("bookings.edit") && <Button icon={<Plus size={16} />} onClick={() => setCreating({ date: today() })}>New booking</Button>}
      />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} items={[{ value: "calendar", label: "Calendar" }, { value: "list", label: "All bookings" }, { value: "packages", label: "Packages & add-ons" }]} />
      </div>
      {tab === "calendar" && <Calendar onOpen={setOpen} onNew={(date) => setCreating({ date })} />}
      {tab === "list" && <List onOpen={setOpen} />}
      {tab === "packages" && <Packages />}
      {creating && <NewBooking date={creating.date} onClose={() => setCreating(null)} onCreated={(id) => { setCreating(null); setOpen(id); }} />}
      {editing && <NewBooking date={today()} existingId={editing} onClose={() => setEditing(null)} onCreated={(id) => { setEditing(null); setOpen(id); }} />}
      {open && !editing && <BookingDetail id={open} onClose={() => setOpen(null)} onEdit={() => setEditing(open)} />}
    </>
  );
}

function Calendar({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: (d: string) => void }) {
  const can = useCan();
  const bookings = useStore((s) => s.bookings);
  const customers = useStore((s) => s.customers);
  const packages = useStore((s) => s.packages);
  const zones = useStore((s) => s.zones);
  const settings = useStore((s) => s.settings);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [sel, setSel] = useState(today());
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    bookings.forEach((b) => m.set(b.date, [...(m.get(b.date) ?? []), b]));
    m.forEach((l) => l.sort((a, b) => a.start.localeCompare(b.start)));
    return m;
  }, [bookings]);
  const dayList = byDay.get(sel) ?? [];
  const room = zones.find((z) => z.kind === "party" && z.active);
  const slots: [string, string][] = [];
  if (room) for (let m = timeToMin(room.openTime); m + 180 <= timeToMin(room.closeTime) + 30; m += 210) slots.push([toHHMM(m), toHHMM(m + 180)]);
  const live = dayList.filter((b) => b.status !== "cancelled");
  const holiday = settings.holidays.find((h) => h.date === sel);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Card pad={false}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-display text-xl font-medium">{format(month, "MMMM yyyy")}</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={16} /></Button>
            <Button variant="secondary" size="sm" onClick={() => { setMonth(startOfMonth(new Date())); setSel(today()); }}>Today</Button>
            <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-extrabold uppercase tracking-wider text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const list = byDay.get(k) ?? [];
            const isHol = settings.holidays.some((h) => h.date === k);
            return (
              <button
                key={k}
                onClick={() => setSel(k)}
                className={cx(
                  "flex min-h-[104px] flex-col justify-start border-b border-r border-[#f2eee6] p-1.5 text-left transition hover:bg-[#fcfaf5]",
                  !isSameMonth(d, month) && "bg-[#fbfaf7] text-[#c3bcae]",
                  sel === k && "bg-sky-soft/60 ring-2 ring-inset ring-sky",
                )}
              >
                <div className="mb-1 flex w-full items-center justify-between">
                  <span className={cx("grid h-6 w-6 place-items-center rounded-full text-xs font-bold", k === today() && "bg-navy text-white")}>{format(d, "d")}</span>
                  {isHol && <span className="h-1.5 w-1.5 rounded-full bg-sun" title="Holiday" />}
                </div>
                <div className="w-full space-y-0.5">
                  {list.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className={cx(
                        "truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-bold",
                        b.status === "cancelled" ? "bg-[#f1eee8] text-[#a9a294] line-through" : b.mode === "full" ? "bg-rose-soft text-[#b5435e]" : b.kind === "party" ? "bg-lilac-soft text-[#7a5fb0]" : "bg-sky-soft text-[#3570ad]",
                      )}
                    >
                      {b.start} {b.kind === "party" ? (b.mode === "full" ? "Full venue" : "Party") : "Play"}
                    </div>
                  ))}
                  {list.length > 3 && <div className="px-1 text-[10px] text-muted">+{list.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 px-5 py-3 text-xs text-muted">
          <Legend c="bg-lilac" t="Party room only" />
          <Legend c="bg-rose" t="Full venue (play area locked)" />
          <Legend c="bg-sky" t="Play reservation" />
          <Legend c="bg-[#cfc8bb]" t="Cancelled" />
          <Legend c="bg-sun" t="Holiday" />
        </div>
      </Card>

      <div className="space-y-4">
        <Card title={format(new Date(sel + "T00:00"), "EEEE, d MMMM")} action={can("bookings.edit") && <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => onNew(sel)}>Book</Button>}>
          {holiday && <p className="mb-3 rounded-lg bg-sun-soft px-3 py-1.5 text-xs font-bold text-[#8a6510]">{holiday.name} — holiday rates apply</p>}
          {room && <div className="mb-4">
            <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted">Party room availability</div>
            <div className="grid grid-cols-3 gap-1.5">
              {slots.map(([s, e]) => {
                const all = live.filter((b) => b.kind === "party" && timeToMin(b.start) < timeToMin(e) && timeToMin(b.end) > timeToMin(s));
                const taken = all.find((b) => b.mode === "full") ?? all[0];
                return (
                  <div key={s} className={cx("rounded-lg px-2 py-1.5 text-center text-xs", taken ? (taken.mode === "full" ? "bg-rose-soft text-[#b5435e]" : "bg-lilac-soft text-[#7a5fb0]") : "bg-mint-soft text-[#2f8f72]")}>
                    <div className="font-bold">{s}–{e}</div>
                    <div>{taken ? all.map((b) => b.ref).join(", ") : "Free"}</div>
                  </div>
                );
              })}
            </div>
          </div>}
          <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted">Play area</div>
          {live.filter((b) => b.mode === "full").length ? (
            live.filter((b) => b.mode === "full").map((b) => (
              <p key={b.id} className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#b5435e]"><Lock size={12} /> Closed to walk-ins {toHHMM(timeToMin(b.start) - 30)}–{b.end}</p>
            ))
          ) : (
            <p className="text-xs text-[#2f8f72]">Open to walk-ins all day · {live.filter((b) => b.kind === "play").reduce((a, b) => a + b.kids, 0)} kids pre-booked</p>
          )}
        </Card>
        <Card title={`Bookings (${dayList.length})`} pad={false}>
          {dayList.length === 0 && <p className="p-5 text-sm text-muted">No bookings on this day.</p>}
          {dayList.map((b) => (
            <button key={b.id} onClick={() => onOpen(b.id)} className={cx("flex w-full items-center gap-3 border-b border-[#f2eee6] px-5 py-3 text-left last:border-0 hover:bg-[#fcfaf5]", b.status === "cancelled" && "opacity-55")}>
              <div className={cx("h-10 w-1 rounded-full", b.mode === "full" ? "bg-rose" : b.kind === "party" ? "bg-lilac" : "bg-sky")} />
              <div className="flex-1">
                <div className="text-sm font-bold">{b.start}–{b.end} · {b.kind === "party" ? packages.find((p) => p.id === b.packageId)?.name : "Play reservation"}</div>
                <div className="text-xs text-muted">{customers.find((c) => c.id === b.customerId)?.name} · {b.guests} guests {b.theme && `· ${b.theme}`}</div>
              </div>
              <Badge tone={STATUS_TONE[b.status]}><span className="capitalize">{b.status}</span></Badge>
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}

const Legend = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-sm", c)} />{t}</span>;

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const bookings = useStore((s) => s.bookings);
  const customers = useStore((s) => s.customers);
  const packages = useStore((s) => s.packages);
  const [f, setF] = useState<"upcoming" | "past" | "pending" | "cancelled" | "balance">("upcoming");
  const d = today();
  const list = bookings
    .filter((b) => (f === "upcoming" ? b.date >= d && b.status !== "cancelled" : f === "past" ? b.date < d : f === "pending" ? b.status === "pending" : f === "cancelled" ? b.status === "cancelled" : b.status !== "cancelled" && b.total - b.paid > 0 && b.date >= d))
    .sort((a, b) => (f === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  return (
    <Card pad={false} title={<Tabs value={f} onChange={setF} items={[{ value: "upcoming", label: "Upcoming" }, { value: "balance", label: "Balance due" }, { value: "pending", label: "Pending" }, { value: "past", label: "Past" }, { value: "cancelled", label: "Cancelled" }]} />}>
      <Table head={["Ref", "Date", "Type", "Customer", "Package", "Guests", "Source", "Total", "Paid", "Balance", "Status"]}>
        {list.map((b) => (
          <tr key={b.id} className="cursor-pointer" onClick={() => onOpen(b.id)}>
            <td className="font-mono text-xs font-bold">{b.ref}</td>
            <td className="whitespace-nowrap tabular">{b.date} · {b.start}</td>
            <td>{b.kind === "party" ? (b.mode === "full" ? <Badge tone="rose">Full venue</Badge> : <Badge tone="lilac">Party room</Badge>) : <Badge tone="sky">Play</Badge>}</td>
            <td>{customers.find((c) => c.id === b.customerId)?.name}</td>
            <td className="text-muted">{packages.find((p) => p.id === b.packageId)?.name ?? "—"}</td>
            <td className="tabular">{b.guests}</td>
            <td className="capitalize text-muted">{b.source}</td>
            <td className="tabular">{money(b.total)}</td>
            <td className="tabular">{money(b.paid)}</td>
            <td className={cx("tabular font-bold", b.total - b.paid > 0 && "text-[#c24f69]")}>{money(b.total - b.paid)}</td>
            <td><Badge tone={STATUS_TONE[b.status]}><span className="capitalize">{b.status}</span></Badge></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function NewBooking({ date, existingId, onClose, onCreated }: { date: string; existingId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const can = useCan();
  const allPackages = useStore((s) => s.packages);
  const allAddons = useStore((s) => s.addons);
  const bookings = useStore((s) => s.bookings);
  const ex = bookings.find((b) => b.id === existingId);
  const packages = allPackages.filter((p) => p.active || p.id === ex?.packageId);
  const addons = allAddons.filter((a) => a.active || ex?.addonIds.includes(a.id));
  const zones = useStore((s) => s.zones);
  const playZone = zones.find((z) => z.kind === "play" && z.active);
  const canParty = zones.some((z) => z.kind === "party" && z.active) && packages.length > 0;
  const create = useStore((s) => s.createBooking);
  const save = useStore((s) => s.save);
  const payBooking = useStore((s) => s.payBooking);
  const [kind, setKind] = useState<"party" | "play">(ex ? (ex.kind === "play" ? "play" : "party") : canParty ? "party" : "play");
  const [customerId, setCustomerId] = useState<string | undefined>(ex?.customerId);
  const [d, setD] = useState(ex?.date ?? date);
  const [start, setStart] = useState(ex?.start ?? "15:00");
  const [pkgId, setPkgId] = useState(ex?.packageId ?? packages[0]?.id);
  const [mode, setMode] = useState<"room" | "full">(ex?.mode ?? "room");
  const [guests, setGuests] = useState(ex?.guests ?? 15);
  const [kids, setKids] = useState(ex?.kids ?? 12);
  const [sel, setSel] = useState<string[]>(ex?.addonIds ?? []);
  const [theme, setTheme] = useState(ex?.theme ?? "");
  const [notes, setNotes] = useState(ex?.notes ?? "");
  const [source, setSource] = useState<Booking["source"]>(ex?.source ?? "phone");
  const [adj, setAdj] = useState(ex?.adjustment ? String(ex.adjustment) : "");
  const [pay, setPay] = useState(ex ? "0" : "");
  const [method, setMethod] = useState<PayMethod>("transfer");
  const [playHours, setPlayHours] = useState(ex && ex.kind === "play" ? Math.max(1, Math.round((timeToMin(ex.end) - timeToMin(ex.start)) / 60)) : 2);

  const pkg = packages.find((p) => p.id === pkgId) ?? packages[0];
  const end = kind === "party" && pkg ? toHHMM(timeToMin(start) + pkg.durationMin) : toHHMM(timeToMin(start) + playHours * 60);
  const price = kind === "party" && pkg ? partyPrice(pkg, mode, guests, sel, addons) : null;
  const playTotal = kids * 1500 * playHours * 0.9;
  const adjustment = Number(adj) || 0;
  const total = Math.max(0, (price ? price.total : Math.round(playTotal)) + adjustment);
  const deposit = price && pkg ? Math.round((total * pkg.depositPct) / 100) : Math.round(total * 0.3);
  const conflict = bookingConflict({ id: ex?.id ?? "", kind, mode: kind === "party" ? mode : undefined, date: d, start, end, kids }, bookings, zones);
  const alreadyPaid = ex?.paid ?? 0;
  const payNow = pay === "" ? deposit : Math.max(0, Math.min(total - alreadyPaid, Number(pay) || 0));
  const roomOnly = pkg ? partyPrice(pkg, "room", guests, sel, addons).total : 0;
  const full = pkg ? partyPrice(pkg, "full", guests, sel, addons).total : 0;

  const submit = async () => {
    if (!customerId) return toast("Choose a customer", "err");
    if (kind === "party" && !pkg) return toast("Set up a party package first (Packages tab)", "err");
    if (kind === "play" && !playZone) return toast("Add a play area in Zones & Capacity first", "err");
    if (conflict) return toast(conflict, "err");
    if (ex) {
      const updated: Booking = {
        ...ex,
        kind,
        mode: kind === "party" ? mode : undefined,
        customerId,
        date: d,
        start,
        end,
        zoneId: kind === "party" ? pkg!.roomZoneId : playZone!.id,
        packageId: kind === "party" ? pkg!.id : undefined,
        guests: kind === "party" ? guests : kids + 1,
        kids,
        addonIds: sel,
        theme,
        notes,
        total,
        adjustment: adjustment || undefined,
        deposit,
        source,
      };
      if (!(await save("bookings", updated, "Bookings", `${ex.ref} updated${source === "phone" ? " (phone)" : ""}`))) return;
      if (payNow > 0 && !(await payBooking(ex.id, payNow, method))) return;
      if (updated.mode === "full" && ex.mode !== "full") toast("Changed to full venue — play area will lock automatically");
      else toast(`${ex.ref} updated`);
      onCreated(ex.id);
      return;
    }
    const b = await create(
      { kind, mode: kind === "party" ? mode : undefined, customerId, date: d, start, end, zoneId: kind === "party" ? pkg!.roomZoneId : playZone!.id, packageId: kind === "party" ? pkg!.id : undefined, guests: kind === "party" ? guests : kids + 1, kids, addonIds: sel, theme, notes, total, adjustment: adjustment || undefined, deposit, paid: 0, status: payNow > 0 ? "confirmed" : "pending", source },
      payNow,
      method,
    );
    if (!b) return;
    if (b.mode === "full") toast("Full venue confirmed — play area will lock automatically");
    else toast(`Booking ${b.ref} created`);
    onCreated(b.id);
  };

  return (
    <Modal open onClose={onClose} title={ex ? `Edit ${ex.ref}` : "New booking"} width="max-w-4xl">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {ex ? (
            <p className="rounded-xl bg-sky-soft px-3 py-2 text-xs text-[#3570ad]">Update the booking as agreed with the customer (e.g. on a phone call). Payments already received ({money(ex.paid)}) are kept.</p>
          ) : (
            <>
              {canParty && playZone && <Tabs value={kind} onChange={setKind} items={[{ value: "party", label: "Birthday / party" }, { value: "play", label: "Play reservation" }]} />}
              {!canParty && (
                <p className="rounded-xl bg-sun-soft px-3 py-2 text-xs text-[#8a6510]">
                  Party bookings need a party-room zone (Zones & Capacity) and at least one bookable package (Packages tab).
                  {!playZone && " Play reservations need a play area zone."}
                </p>
              )}
            </>
          )}
          <Field label="Customer"><CustomerPicker value={customerId} onChange={setCustomerId} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
            <Field label="Start time"><Input type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Ends"><Input value={end} disabled /></Field>
          </div>
          {kind === "party" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {packages.map((p) => (
                  <button key={p.id} onClick={() => { setPkgId(p.id); setGuests(p.guestLimit); }} className={cx("rounded-xl border-2 p-3 text-left", pkgId === p.id ? "border-navy" : "border-line hover:border-sky")}>
                    <div className="font-display font-medium">{p.name}</div>
                    <div className="text-xs text-muted">{p.guestLimit} guests · {p.durationMin / 60}h</div>
                    <div className="mt-1 text-xs">from {money(p.priceRoomOnly)}</div>
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={() => setMode("room")} className={cx("rounded-xl border-2 p-3 text-left", mode === "room" ? "border-lilac bg-lilac-soft" : "border-line")}>
                  <div className="font-bold">Party room only</div>
                  <div className="text-xs text-muted">Play area stays open to the public.</div>
                  <div className="mt-1 font-display text-lg">{money(roomOnly)}</div>
                </button>
                <button onClick={() => setMode("full")} className={cx("rounded-xl border-2 p-3 text-left", mode === "full" ? "border-rose bg-rose-soft" : "border-line")}>
                  <div className="flex items-center gap-1.5 font-bold"><Lock size={13} /> Full venue</div>
                  <div className="text-xs text-muted">Party room + play area. Walk-ins closed.</div>
                  <div className="mt-1 font-display text-lg">{money(full)}</div>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex items-center gap-2 text-sm font-bold">Guests <Counter value={guests} onChange={setGuests} min={1} max={80} /></span>
                <span className="flex items-center gap-2 text-sm font-bold">of which kids <Counter value={kids} onChange={setKids} min={0} max={guests} /></span>
              </div>
              {(["addon", "food", "decor"] as Addon["kind"][]).map((k) => (
                <div key={k}>
                  <div className="mb-1.5 text-[13px] font-bold text-ink/80">{k === "addon" ? "Add-on services" : k === "food" ? "Food options" : "Decoration"}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {addons.filter((a) => a.kind === k).map((a) => (
                      <button key={a.id} onClick={() => setSel(sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id])} className={cx("rounded-full border px-3 py-1 text-xs font-bold", sel.includes(a.id) ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-sky")}>
                        {a.name} · {money(a.price)}{a.perHead && "/head"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Theme / decoration details"><Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Frozen, pastel balloons" /></Field>
                <Field label="Booked via"><Select value={source} onChange={(e) => setSource(e.target.value as Booking["source"])}><option value="phone">Phone</option><option value="walkin">Walk-in</option><option value="online">Online</option></Select></Field>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-5">
              <span className="flex items-center gap-2 text-sm font-bold">Kids <Counter value={kids} onChange={setKids} min={1} max={10} /></span>
              <span className="flex items-center gap-2 text-sm font-bold">Hours <Counter value={playHours} onChange={setPlayHours} min={1} max={4} /></span>
              <Field label="Booked via"><Select value={source} onChange={(e) => setSource(e.target.value as Booking["source"])}><option value="phone">Phone</option><option value="walkin">Walk-in</option><option value="online">Online</option></Select></Field>
            </div>
          )}
          <Field label="Notes / call notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Called 19 Oct — wants cake at 4pm, 5 more guests" /></Field>
        </div>

        <div className="space-y-3 rounded-2xl bg-[#faf7f1] p-4 lg:self-start">
          <div className="font-display text-lg font-medium">Price</div>
          {price ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>{pkg.name} · {mode === "full" ? "full venue" : "room"}</span><span className="tabular">{money(price.base)}</span></div>
              {price.extra > 0 && <div className="flex justify-between"><span>{price.extraGuests} extra guests</span><span className="tabular">{money(price.extra)}</span></div>}
              {price.lines.map((l) => <div key={l.name} className="flex justify-between text-muted"><span>{l.name}</span><span className="tabular">{money(l.amount)}</span></div>)}
            </div>
          ) : (
            <div className="text-sm text-muted">{kids} kids × {playHours}h · 10% online pre-book discount</div>
          )}
          {can("price.override") && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>Price adjustment <span className="text-xs text-muted">(+/−, logged)</span></span>
              <Input type="number" className="h-8 w-28 text-right" value={adj} onChange={(e) => setAdj(e.target.value)} placeholder="0" />
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span className="tabular">{money(total)}</span></div>
          <div className="flex justify-between text-sm text-muted"><span>Deposit ({price ? pkg.depositPct : 30}%)</span><span className="tabular">{money(deposit)}</span></div>
          {ex && (
            <>
              <div className="flex justify-between text-sm text-muted"><span>Already paid</span><span className="tabular">{money(alreadyPaid)}</span></div>
              <div className={cx("flex justify-between text-sm font-bold", total - alreadyPaid < 0 ? "text-[#c24f69]" : "")}><span>{total - alreadyPaid < 0 ? "Overpaid (refund via Cancel/Refund)" : "Balance after update"}</span><span className="tabular">{money(total - alreadyPaid)}</span></div>
            </>
          )}
          <Field label={ex ? "Take a payment now (Rs.)" : "Collect now (Rs.)"}><Input type="number" placeholder={String(deposit)} value={pay} onChange={(e) => setPay(e.target.value)} /></Field>
          {payNow > 0 && <PaymentPicker method={method} onMethod={setMethod} total={payNow} hide={["wallet"]} />}
          {conflict && <p className="rounded-xl bg-rose-soft px-3 py-2 text-xs font-bold text-[#a63a54]">{conflict}</p>}
          {mode === "full" && kind === "party" && !conflict && <p className="rounded-xl bg-sun-soft px-3 py-2 text-xs text-[#8a6510]">Confirming locks the Kids Play Area from {toHHMM(timeToMin(start) - 30)} to {end}. Staff will be alerted.</p>}
          <Button className="w-full" disabled={!!conflict} onClick={submit}>{ex ? (payNow > 0 ? `Save changes & take ${money(payNow)}` : "Save changes") : payNow > 0 ? `Confirm & take ${money(payNow)}` : "Save as pending"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function BookingDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const can = useCan();
  const b = useStore((s) => s.bookings.find((x) => x.id === id))!;
  const customers = useStore((s) => s.customers);
  const packages = useStore((s) => s.packages);
  const addons = useStore((s) => s.addons);
  const allTx = useStore((s) => s.transactions);
  const tx = allTx.filter((t) => t.ref === id);
  const pay = useStore((s) => s.payBooking);
  const setStatus = useStore((s) => s.setBookingStatus);
  const [amt, setAmt] = useState("");
  const [method, setMethod] = useState<PayMethod>("card");
  const [print, setPrint] = useState(false);
  const [refund, setRefund] = useState(false);
  const c = customers.find((x) => x.id === b.customerId);
  const pk = packages.find((x) => x.id === b.packageId);
  const bal = b.total - b.paid;
  const amount = amt === "" ? bal : Math.min(bal, Number(amt) || 0);
  if (print) return <PrintModal open onClose={() => setPrint(false)} title={`Confirmation ${b.ref}`} doc={() => bookingDoc(b)}><BookingConfirmation b={b} /></PrintModal>;
  return (
    <Modal open onClose={onClose} title={`${b.ref} · ${b.kind === "party" ? pk?.name : "Play reservation"}`} width="max-w-2xl">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge tone={STATUS_TONE[b.status]}><span className="capitalize">{b.status}</span></Badge>
            {b.mode === "full" && <Badge tone="rose"><Lock size={11} /> Full venue</Badge>}
            {b.mode === "room" && <Badge tone="lilac">Party room only</Badge>}
            <Badge tone="gray"><span className="capitalize">{b.source}</span></Badge>
          </div>
          <R l="Customer" r={`${c?.name} · ${c?.phone}`} />
          <R l="When" r={`${b.date} · ${b.start}–${b.end}`} />
          <R l="Guests" r={`${b.guests} (${b.kids} kids)`} />
          {b.theme && <R l="Theme" r={b.theme} />}
          {b.addonIds.length > 0 && <R l="Extras" r={b.addonIds.map((a) => addons.find((x) => x.id === a)?.name).join(", ")} />}
          {pk && <R l="Includes" r={pk.includes.join(", ")} />}
          {b.notes && <R l="Notes" r={b.notes} />}
        </div>
        <div className="rounded-2xl bg-[#faf7f1] p-4">
          {b.adjustment ? <R l="Manual adjustment" r={money(b.adjustment)} /> : null}
          <R l="Total" r={money(b.total)} />
          <R l="Paid" r={money(b.paid)} />
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-bold"><span>Balance</span><span className={cx("tabular", bal > 0 && "text-[#c24f69]")}>{money(bal)}</span></div>
          {tx.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-muted">
              {tx.map((t) => <div key={t.id} className="flex justify-between"><span>{fmtDT(t.at)} · {t.type}</span><span className="tabular">{money(t.amount)}</span></div>)}
            </div>
          )}
          {bal > 0 && b.status !== "cancelled" && can("bookings.edit") && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <Input type="number" placeholder={`Amount (balance ${bal})`} value={amt} onChange={(e) => setAmt(e.target.value)} />
              <PaymentPicker method={method} onMethod={setMethod} total={amount} walletBalance={c?.wallet} />
              <Button className="w-full" onClick={async () => { if (!(await pay(b.id, amount, method))) return; setAmt(""); toast(`Received ${money(amount)}`); }}>Receive {money(amount)}</Button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" icon={<Printer size={15} />} onClick={() => setPrint(true)}>Confirmation</Button>
        {can("bookings.edit") && (b.status === "pending" || b.status === "confirmed") && <Button variant="secondary" icon={<Pencil size={15} />} onClick={onEdit}>Edit booking</Button>}
        {can("bookings.edit") && b.status === "pending" && <Button variant="success" onClick={() => setStatus(b.id, "confirmed")}>Confirm</Button>}
        {can("bookings.edit") && b.status === "confirmed" && b.date <= today() && <Button variant="soft" onClick={() => setStatus(b.id, "completed")}>Mark completed</Button>}
        {can("bookings.edit") && (b.status === "pending" || b.status === "confirmed") && (
          <Button variant="danger" onClick={async () => { if (b.paid > 0 && can("refunds.request")) setRefund(true); else if (await setStatus(b.id, "cancelled")) toast("Booking cancelled"); }}>Cancel booking</Button>
        )}
      </div>
      {refund && (
        <RefundDialog open onClose={() => { setRefund(false); setStatus(b.id, "cancelled"); }} target="booking" targetId={b.id} label={b.ref} max={b.paid} method="transfer" category="cancelled" />
      )}
    </Modal>
  );
}

const R = ({ l, r }: { l: string; r: React.ReactNode }) => <div className="flex justify-between gap-4"><span className="text-muted">{l}</span><span className="text-right">{r}</span></div>;

function Packages() {
  const can = useCan();
  const packages = useStore((s) => s.packages);
  const addons = useStore((s) => s.addons);
  const save = useStore((s) => s.save);
  const zones = useStore((s) => s.zones);
  const rooms = zones.filter((z) => z.kind === "party");
  const [edit, setEdit] = useState<PartyPackage | null>(null);
  const [ad, setAd] = useState<Addon | null>(null);
  const editable = can("packages.edit");
  const newPackage = (): PartyPackage => ({ id: "", name: "", roomZoneId: rooms[0]?.id ?? "", guestLimit: 15, durationMin: 180, priceRoomOnly: 0, priceFullVenue: 0, extraGuestPrice: 0, depositPct: 30, includes: [], active: true });
  return (
    <>
      {editable && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          {!rooms.length && <span className="text-xs text-muted">Add a zone of type “party” in Zones & Capacity first.</span>}
          <Button icon={<Plus size={16} />} disabled={!rooms.length} onClick={() => setEdit(newPackage())}>New package</Button>
        </div>
      )}
      {packages.length === 0 && <Card><Empty title="No party packages yet" hint="Create a package to take birthday and party bookings." /></Card>}
      <div className="grid gap-4 lg:grid-cols-3">
        {packages.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between">
              <div className="font-display text-xl font-medium">{p.name}</div>
              {editable && <button onClick={() => setEdit(p)} className="text-muted hover:text-navy"><Pencil size={15} /></button>}
            </div>
            <div className="text-sm text-muted">Up to {p.guestLimit} guests · {p.durationMin / 60} hours · {p.depositPct}% deposit</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-lilac-soft p-3"><div className="text-xs text-[#7a5fb0]">Party room only</div><div className="font-display text-lg font-semibold">{money(p.priceRoomOnly)}</div></div>
              <div className="rounded-xl bg-rose-soft p-3"><div className="text-xs text-[#b5435e]">Full venue</div><div className="font-display text-lg font-semibold">{money(p.priceFullVenue)}</div></div>
            </div>
            <div className="mt-2 text-xs text-muted">Extra guests {money(p.extraGuestPrice)} each</div>
            <ul className="mt-3 space-y-1 text-sm">
              {p.includes.map((i) => <li key={i} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-mint" />{i}</li>)}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="mt-5" title="Add-ons, food & decoration" pad={false} action={editable && <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setAd({ id: "", name: "", kind: "addon", price: 0, perHead: false, active: true })}>Add</Button>}>
        <Table head={["Item", "Type", "Price", "Active", ""]}>
          {addons.map((a) => (
            <tr key={a.id}>
              <td className="font-bold">{a.name}</td>
              <td><Badge tone={a.kind === "food" ? "sun" : a.kind === "decor" ? "lilac" : "teal"}>{a.kind === "addon" ? "Service" : a.kind === "food" ? "Food" : "Decor"}</Badge></td>
              <td className="tabular">{money(a.price)}{a.perHead && <span className="text-muted"> / head</span>}</td>
              <td><Toggle disabled={!editable} checked={a.active} onChange={(v) => save("addons", { ...a, active: v }, "Packages", a.name)} /></td>
              <td className="text-right">{editable && <button onClick={() => setAd(a)} className="text-muted hover:text-navy"><Pencil size={14} /></button>}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : "New package"} width="max-w-xl" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => {
          if (!edit.name.trim()) return toast("Give the package a name", "err");
          if (!edit.roomZoneId) return toast("Choose the party room", "err");
          const item = edit.id ? edit : { ...edit, id: uid("pk") };
          save("packages", item, "Packages", item.name);
          setEdit(null);
          toast("Package saved");
        }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Party room">
              <Select value={edit.roomZoneId} onChange={(e) => setEdit({ ...edit, roomZoneId: e.target.value })}>
                {rooms.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </Select>
            </Field>
            <Field label="Guest limit"><Input type="number" value={edit.guestLimit} onChange={(e) => setEdit({ ...edit, guestLimit: Number(e.target.value) })} /></Field>
            <Field label="Duration (min)"><Input type="number" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: Number(e.target.value) })} /></Field>
            <Field label="Deposit %"><Input type="number" value={edit.depositPct} onChange={(e) => setEdit({ ...edit, depositPct: Number(e.target.value) })} /></Field>
            <Field label="Price — party room only"><Input type="number" value={edit.priceRoomOnly} onChange={(e) => setEdit({ ...edit, priceRoomOnly: Number(e.target.value) })} /></Field>
            <Field label="Price — full venue"><Input type="number" value={edit.priceFullVenue} onChange={(e) => setEdit({ ...edit, priceFullVenue: Number(e.target.value) })} /></Field>
            <Field label="Extra guest price"><Input type="number" value={edit.extraGuestPrice} onChange={(e) => setEdit({ ...edit, extraGuestPrice: Number(e.target.value) })} /></Field>
            <div className="flex items-end pb-2"><Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Bookable" /></div>
            <Field label="What's included (one per line)" className="sm:col-span-2"><Textarea value={edit.includes.join("\n")} onChange={(e) => setEdit({ ...edit, includes: e.target.value.split("\n").filter(Boolean) })} /></Field>
          </div>
        </Modal>
      )}
      {ad && (
        <Modal open onClose={() => setAd(null)} title={ad.id ? "Edit item" : "New item"} footer={<><Button variant="secondary" onClick={() => setAd(null)}>Cancel</Button><Button onClick={() => { const item = ad.id ? ad : { ...ad, id: uid("a") }; save("addons", item, "Packages", item.name); setAd(null); }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={ad.name} onChange={(e) => setAd({ ...ad, name: e.target.value })} /></Field>
            <Field label="Type"><Select value={ad.kind} onChange={(e) => setAd({ ...ad, kind: e.target.value as Addon["kind"] })}><option value="addon">Service</option><option value="food">Food</option><option value="decor">Decoration</option></Select></Field>
            <Field label="Price (Rs.)"><Input type="number" value={ad.price} onChange={(e) => setAd({ ...ad, price: Number(e.target.value) })} /></Field>
            <Toggle checked={ad.perHead} onChange={(v) => setAd({ ...ad, perHead: v })} label="Priced per head" />
          </div>
        </Modal>
      )}
    </>
  );
}
