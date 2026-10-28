"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { Cake, Check, ChevronLeft, Clock, Lock, PartyPopper, Users } from "lucide-react";
import { useBoot, useLiveSync, useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { bookingConflict, bookingQr, partyPrice, toHHMM } from "@/lib/booking";
import type { Booking, PartyPackage } from "@/lib/types";
import { cx, money, timeToMin } from "@/lib/utils";
import { Logo } from "@/components/Shell";
import { CREDIT, CREDIT_PHONE, CREDIT_URL } from "@/lib/credit";
import { Counter } from "@/components/ui";

export default function BookPage() {
  const mounted = useHydrated();
  const ready = useBoot("public");
  if (!mounted || !ready) return null;
  return <Book />;
}

type Mode = "room" | "full";

const AREAS: { mode: Mode; title: string; text: string }[] = [
  { mode: "room", title: "Party room", text: "Your own party room. The play area stays open to other families." },
  { mode: "full", title: "Whole venue", text: "The party room and the play area, just for your guests." },
];

const hoursLabel = (min: number) => `${min / 60} hour${min === 60 ? "" : "s"}`;

/** Online booking is for parties only — the party room or the whole venue. Play visits are walk-in at the front desk. */
function Book() {
  const zones = useStore((s) => s.zones);
  const allPackages = useStore((s) => s.packages);
  const allAddons = useStore((s) => s.addons);
  const bookings = useStore((s) => s.bookings);
  const settings = useStore((s) => s.settings);
  const bookOnline = useStore((s) => s.bookOnline);
  const addons = allAddons.filter((a) => a.active);
  const packages = allPackages.filter((p) => p.active);
  useLiveSync(30000);

  const room = zones.find((z) => z.kind === "party" && z.active);
  const canParty = !!room && packages.length > 0;
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("room");
  const [pkgId, setPkgId] = useState("");
  const [date, setDate] = useState(format(addDays(new Date(), 3), "yyyy-MM-dd"));
  const [start, setStart] = useState("");
  const [guests, setGuests] = useState(15);
  const [sel, setSel] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "", child: "" });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Booking | null>(null);

  const pkg = packages.find((p) => p.id === pkgId);
  const priceOf = (p: PartyPackage, m: Mode) => (m === "full" ? p.priceFullVenue : p.priceRoomOnly);
  const overtimeRate = (p: PartyPackage, m: Mode) => (m === "full" ? p.overtimeFullPerHour : p.overtimeRoomPerHour) ?? 0;
  const fromPrice = (m: Mode) => Math.min(...packages.map((p) => priceOf(p, m)));

  const slots: { start: string; end: string; reason: string | null }[] = [];
  if (pkg && room)
    for (let m = timeToMin(room.openTime); m + pkg.durationMin <= timeToMin(room.closeTime) + 30; m += 60) {
      const s = toHHMM(m), e = toHHMM(m + pkg.durationMin);
      slots.push({ start: s, end: e, reason: bookingConflict({ id: "", kind: "party", mode, date, start: s, end: e, kids: guests }, bookings, zones) });
    }

  const slot = slots.find((s) => s.start === start && !s.reason);
  const price = pkg ? partyPrice(pkg, mode, guests, sel, addons) : null;

  const choosePackage = (p: PartyPackage) => {
    setPkgId(p.id);
    setGuests(p.guestLimit);
    setStart("");
    setStep(2);
  };

  const confirm = async () => {
    if (!slot || !pkg) return;
    setPaying(true);
    setError("");
    // prices, deposit and availability are worked out again on the server
    const r = await bookOnline({ kind: "party", date, start: slot.start, packageId: pkg.id, mode, guests, kids: 0, hours: 0, addonIds: sel, theme, contact });
    setPaying(false);
    if (r.error || !r.booking) return setError(r.error ?? "Booking failed");
    setDone(r.booking);
  };

  const contactOk = contact.name.trim().length > 1 && /^0\d{9}$/.test(contact.phone.replace(/\s/g, ""));
  const canNext = [true, !!pkg, !!slot, true, contactOk][step];
  const steps = ["Area", "Package", "When", "Extras", "You"];

  if (!canParty)
    return (
      <Frame>
        <div className="mx-auto max-w-md rounded-[28px] border border-line bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-semibold text-navy">Online booking opens soon</h1>
          <p className="mt-2 text-muted">We&apos;re getting {settings.businessName} ready. Please call us to book a party in the meantime{settings.phone ? ` on ${settings.phone}` : ""}.</p>
        </div>
      </Frame>
    );

  if (done)
    return (
      <Frame>
        <div className="mx-auto max-w-md rounded-[28px] border border-line bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint-soft text-[#2f8f72]"><Check size={28} /></div>
          <h1 className="mt-4 text-3xl font-semibold text-navy">Party booking requested</h1>
          <p className="mt-1 text-muted">Your slot is held. Pay the {money(done.deposit)} deposit at the venue to confirm it, and show this QR when you arrive — it holds your booking and time.</p>
          <div className="my-5 flex justify-center"><QRCodeSVG value={bookingQr(done)} size={150} fgColor="#24395f" /></div>
          <div className="font-mono text-xl font-bold">{done.ref}</div>
          <div className="mt-4 space-y-1 rounded-2xl bg-[#faf7f1] p-4 text-left text-sm">
            <Row l="Date" r={format(new Date(done.date + "T00:00"), "EEEE, d MMMM")} />
            <Row l="Time" r={`${done.start} – ${done.end}`} />
            <Row l="Package" r={`${pkg?.name} · ${done.mode === "full" ? "Whole venue" : "Party room"}`} />
            <Row l="Guests" r={done.guests} />
            <Row l="Deposit to confirm" r={money(done.deposit)} />
            <Row l="Total" r={money(done.total)} />
          </div>
          {pkg && overtimeRate(pkg, done.mode ?? "room") > 0 && (
            <p className="mt-3 text-xs text-muted">Staying after {done.end} is charged at {money(overtimeRate(pkg, done.mode ?? "room"))} per hour (per half hour, after {pkg.overtimeGraceMin ?? 10} minutes), paid when you leave.</p>
          )}
          <button onClick={() => { setDone(null); setStep(0); setStart(""); setPkgId(""); setSel([]); }} className="mt-5 text-sm font-bold text-navy hover:underline">Make another booking</button>
        </div>
      </Frame>
    );

  return (
    <Frame>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center">
          <h1 className="text-[34px] font-semibold text-navy">Book a party</h1>
          <p className="text-muted">Birthday parties at {settings.businessName}{settings.address ? `, ${settings.address.split(",").pop()?.trim()}` : ""} — in our party room or with the whole venue to yourselves.</p>
        </div>
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className={cx("flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold", i === step ? "bg-navy text-white" : i < step ? "bg-mint-soft text-[#2f8f72]" : "bg-white text-muted")}>
              <span className="tabular">{i + 1}</span> {s}
            </div>
          ))}
        </div>

        <div className="rounded-[28px] border border-line bg-white p-6 shadow-sm sm:p-8">
          {step === 0 && (
            <div>
              <h2 className="mb-4 font-display text-xl font-semibold">Where would you like the party?</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {AREAS.map((a) => (
                  <button
                    key={a.mode}
                    onClick={() => { setMode(a.mode); setStart(""); }}
                    className={cx("flex flex-col items-start rounded-3xl border-2 p-6 text-left transition", mode === a.mode ? (a.mode === "full" ? "border-rose bg-rose-soft/40" : "border-lilac bg-lilac-soft/40") : "border-line hover:border-sky")}
                  >
                    <span className={cx("grid h-14 w-14 place-items-center rounded-2xl", a.mode === "full" ? "bg-rose-soft text-[#c24f69]" : "bg-lilac-soft text-[#7a4fc4]")}>
                      {a.mode === "full" ? <Lock size={26} /> : <Cake size={28} />}
                    </span>
                    <div className="mt-4 font-display text-xl font-semibold">{a.title}</div>
                    <div className="text-sm text-muted">{a.text}</div>
                    <div className="mt-3 text-sm">Packages from <b className="font-display text-lg">{money(fromPrice(a.mode))}</b></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-semibold">Choose a package</h2>
                <span className="text-sm text-muted">Prices for <b className="text-ink">{mode === "full" ? "the whole venue" : "the party room"}</b> · <button onClick={() => setStep(0)} className="font-bold text-navy hover:underline">change</button></span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {packages.map((p) => {
                  const chosen = pkgId === p.id;
                  const other = mode === "full" ? p.priceRoomOnly : p.priceFullVenue;
                  return (
                    <div key={p.id} className={cx("flex flex-col rounded-3xl border-2 p-5", chosen ? "border-navy" : "border-line")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-display text-xl font-semibold">{p.name}</div>
                        <div className="text-right">
                          <div className="font-display text-2xl font-semibold text-navy">{money(priceOf(p, mode))}</div>
                          <div className="text-[11px] text-muted">{mode === "full" ? "Party room only" : "Whole venue"}: {money(other)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="flex items-center gap-1.5"><Clock size={14} className="text-muted" /> {hoursLabel(p.durationMin)}</span>
                        <span className="flex items-center gap-1.5"><Users size={14} className="text-muted" /> Up to {p.guestLimit} guests</span>
                      </div>
                      {p.includes.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {p.includes.map((x) => (
                            <li key={x} className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-[#3aa985]" /> {x}</li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-3 space-y-0.5 rounded-xl bg-[#faf7f1] px-3 py-2 text-xs text-muted">
                        <div>Extra guests over {p.guestLimit}: <b className="text-ink">{money(p.extraGuestPrice)}</b> each</div>
                        <div>Deposit to confirm: <b className="text-ink">{p.depositPct}%</b> ({money(Math.round((priceOf(p, mode) * p.depositPct) / 100))} on the package price), paid at the venue</div>
                        {overtimeRate(p, mode) > 0 && (
                          <div>Staying longer: <b className="text-ink">{money(overtimeRate(p, mode))}</b> per hour, charged per half hour after {p.overtimeGraceMin ?? 10} min</div>
                        )}
                      </div>
                      <div className="flex-1" />
                      <button onClick={() => choosePackage(p)} className={cx("mt-4 rounded-2xl px-5 py-2.5 font-bold transition", chosen ? "bg-navy text-white" : "border-2 border-navy text-navy hover:bg-sky-soft")}>
                        {chosen ? "Selected — continue" : "Choose this package"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {addons.length > 0 && (
                <div className="mt-5 rounded-2xl border border-dashed border-line p-4">
                  <div className="mb-2 text-sm font-bold">Optional extras (added after you choose a package)</div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {addons.map((a) => <span key={a.id} className="rounded-full bg-[#faf7f1] px-3 py-1">{a.name} · {money(a.price)}{a.perHead && " per guest"}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && pkg && (
            <div className="space-y-5">
              <Summary pkg={pkg} mode={mode} onChange={() => setStep(1)} />
              <label className="block w-fit">
                <span className="mb-1 block text-sm font-bold">Date</span>
                <input type="date" min={format(new Date(), "yyyy-MM-dd")} value={date} onChange={(e) => { setDate(e.target.value); setStart(""); }} className="h-11 rounded-xl border border-line px-3" />
              </label>
              <div>
                <span className="mb-2 block text-sm font-bold">Pick a start time <span className="font-normal text-muted">({hoursLabel(pkg.durationMin)} party)</span></span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((s) => (
                    <button key={s.start} disabled={!!s.reason} title={s.reason ?? `${s.start} – ${s.end}`} onClick={() => setStart(s.start)} className={cx("rounded-xl border-2 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#f4f1ec] disabled:text-[#bdb5a7] disabled:line-through", start === s.start ? "border-navy bg-navy text-white" : "border-line hover:border-sky")}>
                      {s.start}
                    </button>
                  ))}
                </div>
                {slot && <p className="mt-2 text-sm text-muted">Your party runs {slot.start} – {slot.end}.</p>}
                {slots.length > 0 && slots.every((s) => s.reason) && <p className="mt-2 text-sm text-[#c24f69]">That day is fully booked — please try another date.</p>}
              </div>
            </div>
          )}

          {step === 3 && pkg && price && (
            <div className="space-y-5">
              <Summary pkg={pkg} mode={mode} onChange={() => setStep(1)} />
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold">Number of guests</span>
                <Counter value={guests} onChange={setGuests} min={5} max={80} />
                <span className="text-xs text-muted">{guests > pkg.guestLimit ? `${guests - pkg.guestLimit} over the package · +${money(pkg.extraGuestPrice)} each` : `Package covers up to ${pkg.guestLimit}`}</span>
              </div>
              {addons.length > 0 && (
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
              )}
              <label className="block"><span className="mb-1 block text-sm font-bold">Party theme</span><input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Unicorns, dinosaurs, Frozen…" className="h-11 w-full rounded-xl border border-line px-3" /></label>
              <div className="rounded-2xl bg-sky-soft p-4 text-sm">
                <Row l={`${pkg.name} · ${mode === "full" ? "Whole venue" : "Party room"}`} r={money(price.base)} />
                {price.extraGuests > 0 && <Row l={`${price.extraGuests} extra guest${price.extraGuests > 1 ? "s" : ""} × ${money(pkg.extraGuestPrice)}`} r={money(price.extra)} />}
                {price.lines.map((l) => <Row key={l.name} l={l.name} r={money(l.amount)} />)}
                <div className="mt-2 flex items-end justify-between border-t border-white/70 pt-2">
                  <div><div className="text-muted">Total</div><div className="font-display text-3xl font-semibold">{money(price.total)}</div></div>
                  <div className="text-right">Deposit to confirm ({pkg.depositPct}%)<b className="block font-display text-xl">{money(price.deposit)}</b></div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && pkg && price && (
            <div className="grid gap-4 sm:grid-cols-2">
              {([["name", "Your name"], ["phone", "Mobile (07X XXX XXXX)"], ["email", "Email (optional)"], ["child", "Birthday child's name"]] as const).map(([k, l]) => (
                <label key={k} className="block"><span className="mb-1 block text-sm font-bold">{l}</span><input value={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} className="h-11 w-full rounded-xl border border-line px-3" /></label>
              ))}
              <div className="rounded-2xl bg-[#faf7f1] p-4 text-sm sm:col-span-2">
                <Row l="Party" r={`${pkg.name} · ${mode === "full" ? "Whole venue" : "Party room"}`} />
                <Row l="When" r={`${format(new Date(date + "T00:00"), "EEE d MMM")} · ${slot?.start}–${slot?.end}`} />
                <Row l="Guests" r={guests} />
                <Row l="Total" r={money(price.total)} />
                <Row l="Deposit to confirm" r={<b>{money(price.deposit)}</b>} />
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm font-bold text-muted"><ChevronLeft size={16} /> Back</button> : <span />}
            {step < 4 ? (
              // on the package step, choosing a package moves on; Continue is for coming back to a chosen one
              <button disabled={!canNext} onClick={() => setStep(step + 1)} className="rounded-2xl bg-navy px-7 py-3 font-bold text-white shadow-[0_3px_0_#22416f] disabled:opacity-40">Continue</button>
            ) : (
              <button disabled={!canNext || paying} onClick={confirm} className="flex items-center gap-2 rounded-2xl bg-[#3aa985] px-7 py-3 font-bold text-white shadow-[0_3px_0_#2a7e63] disabled:opacity-50">
                {paying ? "Sending…" : <><Check size={18} /> Request booking</>}
              </button>
            )}
          </div>
        </div>
        {error && <p className="mx-auto mt-4 max-w-md rounded-xl bg-rose-soft px-3 py-2 text-center text-sm font-bold text-[#a63a54]">{error}</p>}
        <p className="mt-4 text-center text-xs text-muted">Nothing is charged online. Your slot is held, and it&apos;s confirmed once the deposit is paid at the venue. Free cancellation up to 7 days before. Play sessions don&apos;t need booking — just come in.</p>
      </div>
    </Frame>
  );
}

function Summary({ pkg, mode, onChange }: { pkg: PartyPackage; mode: Mode; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#faf7f1] p-4">
      <div>
        <div className="font-display text-lg font-semibold">{pkg.name} · {mode === "full" ? "Whole venue" : "Party room"}</div>
        <div className="text-sm text-muted">{hoursLabel(pkg.durationMin)} · up to {pkg.guestLimit} guests{pkg.includes.length ? ` · ${pkg.includes.join(", ")}` : ""}</div>
      </div>
      <button onClick={onChange} className="text-sm font-bold text-navy hover:underline">Change package</button>
    </div>
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
      <p className="relative mt-10 text-center text-xs text-muted">
        <a href={CREDIT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-navy hover:underline">{CREDIT}</a> · {CREDIT_PHONE}
      </p>
    </div>
  );
}

const Row = ({ l, r }: { l: string; r: React.ReactNode }) => <div className="flex justify-between gap-3 py-0.5"><span className="text-muted">{l}</span><span className="text-right">{r}</span></div>;
