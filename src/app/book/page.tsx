"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { Cake, Check, ChevronLeft, CreditCard, Lock, PartyPopper, Smile } from "lucide-react";
import { useBoot, useLiveSync, useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { bookingConflict, partyPrice, toHHMM } from "@/lib/booking";
import { rulesFor } from "@/lib/pricing";
import type { Booking } from "@/lib/types";
import { cx, money, timeToMin } from "@/lib/utils";
import { Logo } from "@/components/Shell";
import { Counter } from "@/components/ui";

export default function BookPage() {
  const mounted = useHydrated();
  const ready = useBoot("public");
  if (!mounted || !ready) return null;
  return <Book />;
}

type Kind = "play" | "party";

function Book() {
  const zones = useStore((s) => s.zones);
  const packages = useStore((s) => s.packages);
  const allAddons = useStore((s) => s.addons);
  const bookings = useStore((s) => s.bookings);
  const plans = useStore((s) => s.ratePlans);
  const rules = useStore((s) => s.rules);
  const settings = useStore((s) => s.settings);
  const bookOnline = useStore((s) => s.bookOnline);
  const addons = allAddons.filter((a) => a.active);
  useLiveSync(30000);

  const [step, setStep] = useState(0);
  const play = zones.find((z) => z.kind === "play" && z.active);
  const room = zones.find((z) => z.kind === "party" && z.active);
  const hourPlan = plans.find((p) => p.zoneId === play?.id && p.unit === "hour");
  // only offer what the venue has set up
  const canPlay = !!play && !!hourPlan;
  const canParty = !!room && packages.some((p) => p.active);
  const [kind, setKind] = useState<Kind>(canParty ? "party" : "play");
  const [date, setDate] = useState(format(addDays(new Date(), 3), "yyyy-MM-dd"));
  const [start, setStart] = useState("");
  const [pkgId, setPkgId] = useState(packages.find((p) => p.active)?.id ?? "");
  const [mode, setMode] = useState<"room" | "full">("room");
  const [guests, setGuests] = useState(15);
  const [kids, setKids] = useState(2);
  const [hours, setHours] = useState(2);
  const [sel, setSel] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "", child: "" });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Booking | null>(null);

  const pkg = packages.find((p) => p.id === pkgId);

  const slots = useMemo(() => {
    const out: { start: string; end: string; reason: string | null }[] = [];
    if (kind === "party" && pkg && room) {
      for (let m = timeToMin(room.openTime); m + pkg.durationMin <= timeToMin(room.closeTime) + 30; m += 60) {
        const s = toHHMM(m), e = toHHMM(m + pkg.durationMin);
        out.push({ start: s, end: e, reason: bookingConflict({ id: "", kind: "party", mode, date, start: s, end: e, kids: guests }, bookings, zones) });
      }
    } else if (play) {
      for (let m = timeToMin(play.openTime); m + hours * 60 <= timeToMin(play.closeTime); m += 60) {
        const s = toHHMM(m), e = toHHMM(m + hours * 60);
        out.push({ start: s, end: e, reason: bookingConflict({ id: "", kind: "play", date, start: s, end: e, kids }, bookings, zones) });
      }
    }
    return out;
  }, [kind, pkg, mode, date, guests, kids, hours, bookings, zones, room, play]);

  const slot = slots.find((s) => s.start === start && !s.reason);
  const price = kind === "party" && pkg ? partyPrice(pkg, mode, guests, sel, addons) : null;
  const playPrice = useMemo(() => {
    if (kind !== "play" || !hourPlan || !play) return 0;
    const at = new Date(`${date}T${start || "10:00"}:00`);
    const base = hourPlan.price * hours * kids;
    const adj = rulesFor(rules, settings, play.id, at).reduce((a, r) => a + (r.adjust === "percent" ? (base * r.value) / 100 : r.value * kids), 0);
    return Math.round((base + adj) * 0.9);
  }, [kind, hourPlan, date, start, hours, kids, rules, settings, play]);
  const total = price ? price.total : playPrice;
  const deposit = price ? price.deposit : Math.round(total * 0.3);

  const confirm = async () => {
    if (!slot) return;
    setPaying(true);
    setError("");
    // prices, deposit and availability are worked out again on the server
    const r = await bookOnline({ kind, date, start: slot.start, packageId: kind === "party" ? pkg?.id : undefined, mode, guests, kids, hours, addonIds: kind === "party" ? sel : [], theme, contact });
    setPaying(false);
    if (r.error || !r.booking) return setError(r.error ?? "Booking failed");
    setDone(r.booking);
  };

  const canNext = [true, !!slot, kind === "play" || !!pkg, contact.name.trim().length > 1 && /^0\d{9}$/.test(contact.phone.replace(/\s/g, ""))][step];
  const steps = ["What", "When", "Details", "You"];

  if (!canPlay && !canParty)
    return (
      <Frame>
        <div className="mx-auto max-w-md rounded-[28px] border border-line bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-semibold text-navy">Online booking opens soon</h1>
          <p className="mt-2 text-muted">We&apos;re getting {settings.businessName} ready. Please call us to book a visit or a party in the meantime{settings.phone ? ` on ${settings.phone}` : ""}.</p>
        </div>
      </Frame>
    );

  if (done)
    return (
      <Frame>
        <div className="mx-auto max-w-md rounded-[28px] border border-line bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint-soft text-[#2f8f72]"><Check size={28} /></div>
          <h1 className="mt-4 text-3xl font-semibold text-navy">You&apos;re booked!</h1>
          <p className="mt-1 text-muted">We&apos;ve sent the confirmation to {done && contact.phone}{contact.email && ` and ${contact.email}`}.</p>
          <div className="my-5 flex justify-center"><QRCodeSVG value={done.ref} size={150} fgColor="#24395f" /></div>
          <div className="font-mono text-xl font-bold">{done.ref}</div>
          <div className="mt-4 space-y-1 rounded-2xl bg-[#faf7f1] p-4 text-left text-sm">
            <Row l="Date" r={format(new Date(done.date + "T00:00"), "EEEE, d MMMM")} />
            <Row l="Time" r={`${done.start} – ${done.end}`} />
            <Row l="Booking" r={done.kind === "party" ? `${pkg?.name} · ${done.mode === "full" ? "Whole venue" : "Party room"}` : `Play visit · ${kids} kids`} />
            <Row l="Deposit paid" r={money(done.paid)} />
            <Row l="Balance on the day" r={money(done.total - done.paid)} />
          </div>
          <button onClick={() => { setDone(null); setStep(0); setStart(""); }} className="mt-5 text-sm font-bold text-navy hover:underline">Make another booking</button>
        </div>
      </Frame>
    );

  return (
    <Frame>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="text-[34px] font-semibold text-navy">Book your visit</h1>
          <p className="text-muted">Play sessions and birthday parties at {settings.businessName}, {settings.address.split(",").pop()?.trim()}.</p>
        </div>
        <div className="mb-6 flex justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className={cx("flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold", i === step ? "bg-navy text-white" : i < step ? "bg-mint-soft text-[#2f8f72]" : "bg-white text-muted")}>
              <span className="tabular">{i + 1}</span> {s}
            </div>
          ))}
        </div>

        <div className="rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-8">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {([["play", "Play session", "Book play time for your little ones.", <Smile key="s" size={28} />, "bg-sky-soft", "text-[#3570ad]"], ["party", "Birthday party", "Party room or the whole venue, all set up for you.", <Cake key="c" size={28} />, "bg-rose-soft", "text-[#c24f69]"]] as const).filter(([k]) => (k === "play" ? canPlay : canParty)).map(([k, t, d, icon, bg, tx]) => (
                <button key={k} onClick={() => { setKind(k); setStart(""); }} className={cx("flex flex-col items-start rounded-3xl border-2 p-6 text-left transition", kind === k ? "border-navy" : "border-line hover:border-sky")}>
                  <span className={cx("grid h-14 w-14 place-items-center rounded-2xl", bg, tx)}>{icon}</span>
                  <div className="mt-4 font-display text-xl font-semibold">{t}</div>
                  <div className="text-sm text-muted">{d}</div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end gap-4">
                <label>
                  <span className="mb-1 block text-sm font-bold">Date</span>
                  <input type="date" min={format(new Date(), "yyyy-MM-dd")} value={date} onChange={(e) => { setDate(e.target.value); setStart(""); }} className="h-11 rounded-xl border border-line px-3" />
                </label>
                {kind === "play" ? (
                  <>
                    <div><span className="mb-1 block text-sm font-bold">Kids</span><Counter value={kids} onChange={setKids} min={1} max={8} /></div>
                    <div><span className="mb-1 block text-sm font-bold">Hours</span><Counter value={hours} onChange={setHours} min={1} max={4} /></div>
                  </>
                ) : (
                  <div className="flex gap-2">
                    {packages.filter((p) => p.active).map((p) => (
                      <button key={p.id} onClick={() => { setPkgId(p.id); setGuests(p.guestLimit); setStart(""); }} className={cx("rounded-xl border-2 px-3 py-2 text-sm font-bold", pkgId === p.id ? "border-navy" : "border-line")}>{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
              {kind === "party" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button onClick={() => { setMode("room"); setStart(""); }} className={cx("rounded-2xl border-2 p-4 text-left", mode === "room" ? "border-lilac bg-lilac-soft" : "border-line")}>
                    <div className="font-bold">Party room</div>
                    <div className="text-sm text-muted">Your own room; the play area stays open to other families.</div>
                  </button>
                  <button onClick={() => { setMode("full"); setStart(""); }} className={cx("rounded-2xl border-2 p-4 text-left", mode === "full" ? "border-rose bg-rose-soft" : "border-line")}>
                    <div className="flex items-center gap-1.5 font-bold"><Lock size={14} /> Whole venue</div>
                    <div className="text-sm text-muted">Party room and play area, just for your guests.</div>
                  </button>
                </div>
              )}
              <div>
                <span className="mb-2 block text-sm font-bold">Pick a start time</span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((s) => (
                    <button key={s.start} disabled={!!s.reason} title={s.reason ?? ""} onClick={() => setStart(s.start)} className={cx("rounded-xl border-2 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#f4f1ec] disabled:text-[#bdb5a7] disabled:line-through", start === s.start ? "border-navy bg-navy text-white" : "border-line hover:border-sky")}>
                      {s.start}
                    </button>
                  ))}
                </div>
                {slots.some((s) => s.reason?.includes("exclusive")) && <p className="mt-2 text-xs text-[#c24f69]">Some times are unavailable because the venue is booked for a private party.</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {kind === "party" && pkg ? (
                <>
                  <div className="rounded-2xl bg-[#faf7f1] p-4">
                    <div className="font-display text-lg font-semibold">{pkg.name} · {mode === "full" ? "Whole venue" : "Party room"}</div>
                    <div className="text-sm text-muted">{pkg.durationMin / 60} hours · up to {pkg.guestLimit} guests · {pkg.includes.join(", ")}</div>
                  </div>
                  <div className="flex items-center gap-3"><span className="text-sm font-bold">Number of guests</span><Counter value={guests} onChange={setGuests} min={5} max={80} />{guests > pkg.guestLimit && <span className="text-xs text-muted">+{money(pkg.extraGuestPrice)} per extra guest</span>}</div>
                  <div>
                    <span className="mb-2 block text-sm font-bold">Make it extra special</span>
                    <div className="flex flex-wrap gap-2">
                      {addons.map((a) => (
                        <button key={a.id} onClick={() => setSel(sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id])} className={cx("rounded-full border px-3 py-1.5 text-sm font-bold", sel.includes(a.id) ? "border-navy bg-navy text-white" : "border-line")}>
                          {a.name} · {money(a.price)}{a.perHead && "/guest"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block"><span className="mb-1 block text-sm font-bold">Party theme</span><input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Unicorns, dinosaurs, Frozen…" className="h-11 w-full rounded-xl border border-line px-3" /></label>
                </>
              ) : (
                <p className="text-muted">{kids} kids · {hours} hour{hours > 1 && "s"} on {format(new Date(date + "T00:00"), "EEEE d MMMM")} at {start}. Online bookings get 10% off the counter price.</p>
              )}
              <div className="flex items-end justify-between rounded-2xl bg-sky-soft p-4">
                <div>
                  <div className="text-sm text-muted">Total</div>
                  <div className="font-display text-3xl font-semibold">{money(total)}</div>
                </div>
                <div className="text-right text-sm">Deposit today <b className="block font-display text-xl">{money(deposit)}</b></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {([["name", "Your name"], ["phone", "Mobile (07X XXX XXXX)"], ["email", "Email (optional)"], ["child", kind === "party" ? "Birthday child's name" : "Child's name (optional)"]] as const).map(([k, l]) => (
                <label key={k} className="block"><span className="mb-1 block text-sm font-bold">{l}</span><input value={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} className="h-11 w-full rounded-xl border border-line px-3" /></label>
              ))}
              <div className="rounded-2xl bg-[#faf7f1] p-4 text-sm sm:col-span-2">
                <Row l="When" r={`${format(new Date(date + "T00:00"), "EEE d MMM")} · ${slot?.start}–${slot?.end}`} />
                <Row l="Total" r={money(total)} />
                <Row l="Deposit now" r={<b>{money(deposit)}</b>} />
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm font-bold text-muted"><ChevronLeft size={16} /> Back</button> : <span />}
            {step < 3 ? (
              <button disabled={!canNext} onClick={() => setStep(step + 1)} className="rounded-2xl bg-navy px-7 py-3 font-bold text-white shadow-[0_3px_0_#22416f] disabled:opacity-40">Continue</button>
            ) : (
              <button disabled={!canNext || paying} onClick={confirm} className="flex items-center gap-2 rounded-2xl bg-[#3aa985] px-7 py-3 font-bold text-white shadow-[0_3px_0_#2a7e63] disabled:opacity-50">
                {paying ? "Processing payment…" : <><CreditCard size={18} /> Pay {money(deposit)} deposit</>}
              </button>
            )}
          </div>
        </div>
        {error && <p className="mx-auto mt-4 max-w-md rounded-xl bg-rose-soft px-3 py-2 text-center text-sm font-bold text-[#a63a54]">{error}</p>}
        <p className="mt-4 text-center text-xs text-muted">Secure card payment (simulated for this demo). Free cancellation up to 7 days before.</p>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fffdf9] px-4 pb-16">
      <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-sky-soft" />
      <div className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-rose-soft" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-56 w-56 rounded-full bg-sun-soft" />
      <header className="relative mx-auto flex max-w-5xl items-center justify-between py-5">
        <Logo className="w-[150px]" />
        <Link href="/login" className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy"><PartyPopper size={15} /> Staff login</Link>
      </header>
      <div className="relative">{children}</div>
    </div>
  );
}

const Row = ({ l, r }: { l: string; r: React.ReactNode }) => <div className="flex justify-between py-0.5"><span className="text-muted">{l}</span><span>{r}</span></div>;
