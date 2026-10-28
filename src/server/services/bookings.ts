import "server-only";
import { addDays, format } from "date-fns";
import { bookingConflict, overtimeFor, partyPrice, toHHMM } from "@/lib/booking";
import type { Booking, PayMethod } from "@/lib/types";
import { timeToMin, uid } from "@/lib/utils";
import { readCollection } from "../snapshot";
import { badRequest, HttpError } from "../http";
import type { Mut } from "../mutation";
import { chargeWallet } from "./money";
import { alertOnlineBooking } from "../whatsapp/messages";

export type NewBooking = Omit<Booking, "id" | "ref" | "createdAt">;

/** Same availability rules as the calendar and the online booking page. */
async function assertSlotFree(m: Mut, b: Pick<Booking, "kind" | "mode" | "date" | "start" | "end" | "kids" | "id">) {
  await m.lock("bookings-calendar");
  const zones = await readCollection(m.tx, "zones");
  const sameDay = await m.rows("bookings", "SELECT * FROM bookings WHERE date = $1", [b.date]);
  const reason = bookingConflict(b, sameDay, zones);
  if (reason) throw badRequest(reason);
}

/**
 * A party's total is the package price for its guests, mode and add-ons plus the adjustment (which needs
 * its own permission); a different figure from the browser needs the price override permission too.
 */
async function assertPartyTotal(m: Mut, b: Pick<Booking, "kind" | "mode" | "packageId" | "guests" | "addonIds" | "total" | "adjustment">) {
  if (b.kind !== "party" || m.actor.can("price.override")) return;
  const pkg = b.packageId ? await m.find("packages", b.packageId) : undefined;
  if (!pkg) throw badRequest("Choose a party package");
  const addons = await readCollection(m.tx, "addons");
  const expected = Math.max(0, partyPrice(pkg, b.mode ?? "room", b.guests, b.addonIds, addons).total + (b.adjustment ?? 0));
  if (Math.abs(b.total - expected) > 1) throw new HttpError(403, `The package price is Rs. ${expected.toLocaleString()} — changing it needs the “Override price” permission`);
}

async function nextRef(m: Mut) {
  await m.lock("booking-ref");
  const { n } = (await m.tx.one<{ n: number }>("SELECT coalesce(max(substring(ref FROM 4)::int), 1000) AS n FROM bookings WHERE ref ~ '^BK-[0-9]+$'"))!;
  return `BK-${n + 1}`;
}

export async function createBooking(m: Mut, b: NewBooking, payNow: number, method: PayMethod | "online") {
  await m.get("customers", b.customerId, "Customer");
  if (b.adjustment && !m.actor.can("price.override")) throw new HttpError(403, "Price adjustments need the “Override price” permission");
  if (payNow < 0 || payNow > b.total) throw badRequest("Invalid payment amount");
  await assertPartyTotal(m, b);
  await assertSlotFree(m, { ...b, id: "" });
  if (method === "wallet" && payNow > 0) await chargeWallet(m, await m.get("customers", b.customerId, "Customer", { lock: true }), payNow);
  const bk = await m.insert("bookings", { ...b, id: uid("b"), ref: await nextRef(m), createdAt: new Date().toISOString(), paid: payNow });
  if (payNow > 0) await m.addTx({ type: "deposit", method, amount: payNow, ref: bk.id, refLabel: bk.ref, customerId: bk.customerId, discount: 0 });
  await m.log("Bookings", "Created booking", `${bk.ref} · ${bk.kind}${bk.mode === "full" ? " (full venue)" : ""} · ${bk.date} ${bk.start}`);
  return bk;
}

/** Edit an existing booking. Money already received and the reference can't be changed this way. */
export async function updateBooking(m: Mut, b: Booking) {
  const ex = await m.get("bookings", b.id, "Booking", { lock: true });
  if ((b.adjustment ?? 0) !== (ex.adjustment ?? 0) && !m.actor.can("price.override"))
    throw new HttpError(403, "Price adjustments need the “Override price” permission");
  const repriced =
    b.total !== ex.total || b.packageId !== ex.packageId || b.mode !== ex.mode || b.guests !== ex.guests || b.addonIds.join() !== ex.addonIds.join() || b.kind !== ex.kind;
  if (repriced) await assertPartyTotal(m, b);
  const moved = b.date !== ex.date || b.start !== ex.start || b.end !== ex.end || b.kind !== ex.kind || b.mode !== ex.mode || b.kids !== ex.kids;
  if (moved && (b.status === "pending" || b.status === "confirmed")) await assertSlotFree(m, b);
  // arrival, departure and overtime only change through check-in / check-out
  const visit = { checkedInAt: ex.checkedInAt, checkedOutAt: ex.checkedOutAt, overtimeMin: ex.overtimeMin, overtimeCharge: ex.overtimeCharge };
  return { before: ex, after: await m.put("bookings", { ...b, ...visit, ref: ex.ref, paid: ex.paid, createdAt: ex.createdAt, source: b.source ?? ex.source }) };
}

export async function payBooking(m: Mut, id: string, amount: number, method: PayMethod) {
  const b = await m.get("bookings", id, "Booking", { lock: true });
  if (amount <= 0) throw badRequest("Enter an amount");
  if (amount > b.total - b.paid) throw badRequest(`The balance is only Rs. ${(b.total - b.paid).toLocaleString()}`);
  if (method === "wallet") await chargeWallet(m, await m.get("customers", b.customerId, "Customer", { lock: true }), amount);
  await m.update("bookings", id, { paid: b.paid + amount, status: b.status === "pending" ? "confirmed" : b.status });
  await m.addTx({ type: b.paid === 0 ? "deposit" : "party", method, amount, ref: b.id, refLabel: b.ref, customerId: b.customerId, discount: 0 });
  await m.log("Bookings", "Payment received", `${b.ref} · Rs. ${amount.toLocaleString()}`);
}

/**
 * The party arrives (booking QR scanned) or leaves. Leaving after the booked end time — past the package's
 * grace minutes — adds the overtime to the bill; the balance is then collected like any booking payment.
 * Waiving the overtime needs the price override permission.
 */
export async function partyVisit(m: Mut, id: string, action: "in" | "out", waive = false) {
  const b = await m.get("bookings", id, "Booking", { lock: true });
  if (b.kind !== "party") throw badRequest("Only party bookings are checked in and out");
  const now = new Date();
  if (action === "in") {
    if (b.status !== "pending" && b.status !== "confirmed") throw badRequest(`This booking is ${b.status}`);
    if (b.date !== format(now, "yyyy-MM-dd")) throw badRequest(`This booking is for ${b.date}, not today`);
    if (b.checkedInAt) throw badRequest(`${b.ref} already checked in`);
    const after = await m.update("bookings", id, { checkedInAt: now.toISOString() });
    await m.log("Bookings", "Party checked in", `${b.ref} · booked ${b.start}–${b.end}`);
    return after;
  }
  if (!b.checkedInAt) throw badRequest("Check the party in first");
  if (b.checkedOutAt) throw badRequest(`${b.ref} already checked out`);
  if (waive && !m.actor.can("price.override")) throw new HttpError(403, "Waiving overtime needs the “Override price” permission");
  const pkg = b.packageId ? await m.find("packages", b.packageId) : undefined;
  const ot = overtimeFor(b, pkg, now);
  const charge = waive ? 0 : ot.charge;
  const after = await m.update("bookings", id, { checkedOutAt: now.toISOString(), overtimeMin: ot.minutes, overtimeCharge: charge, total: b.total + charge, status: "completed" });
  await m.log(
    "Bookings",
    "Party checked out",
    `${b.ref} · booked until ${b.end}${ot.minutes ? ` · ${ot.minutes} min over` : ""}${charge ? ` · overtime Rs. ${charge.toLocaleString()}` : ot.charge && waive ? " · overtime waived" : ""}`,
  );
  return after;
}

export async function setBookingStatus(m: Mut, id: string, status: Booking["status"]) {
  const b = await m.get("bookings", id, "Booking", { lock: true });
  if (b.status === status) return;
  await m.update("bookings", id, { status });
  await m.log("Bookings", "Status changed", `${b.ref}: ${b.status} → ${status}`);
}

export interface PublicBookingInput {
  kind: "play" | "party";
  date: string;
  start: string;
  packageId?: string;
  mode: "room" | "full";
  guests: number;
  kids: number;
  hours: number;
  addonIds: string[];
  theme: string;
  contact: { name: string; phone: string; email: string; child: string };
}

/**
 * Online booking from the public /book page. Everything that affects money or availability is
 * recomputed here — the browser only sends the customer's choices.
 */
export async function publicBooking(m: Mut, inp: PublicBookingInput) {
  const phone = inp.contact.phone.replace(/\s/g, "");
  if (inp.contact.name.trim().length < 2) throw badRequest("Please tell us your name");
  if (!/^0\d{9}$/.test(phone)) throw badRequest("Enter a mobile number like 07X XXX XXXX");
  const today = format(new Date(), "yyyy-MM-dd");
  if (inp.date < today || inp.date > format(addDays(new Date(), 365), "yyyy-MM-dd")) throw badRequest("Choose a date within the next year");

  // online booking is for parties (party room or the whole venue); play visits are walk-in at the front desk
  if (inp.kind !== "party") throw badRequest("Online booking is for parties — play sessions don't need booking, just come in");
  const zones = await readCollection(m.tx, "zones");
  const room = zones.find((z) => z.kind === "party");
  if (!room) throw badRequest("Online booking is not available right now");
  const settings = await m.settings();

  const pkg = inp.packageId ? await m.find("packages", inp.packageId) : undefined;
  if (!pkg || !pkg.active) throw badRequest("Choose a party package");
  if (inp.guests < 5 || inp.guests > 80) throw badRequest("Parties are for 5–80 guests");
  const addons = inp.addonIds.length ? await m.rows("addons", "SELECT * FROM addons WHERE id = ANY($1::text[]) AND active ORDER BY seq", [inp.addonIds]) : [];
  const price = partyPrice(pkg, inp.mode, inp.guests, addons.map((a) => a.id), addons);
  const booking: NewBooking = {
    kind: "party",
    mode: inp.mode,
    customerId: "",
    date: inp.date,
    start: inp.start,
    end: toHHMM(timeToMin(inp.start) + pkg.durationMin),
    zoneId: room.id,
    packageId: pkg.id,
    guests: inp.guests,
    kids: Math.round(inp.guests * 0.75),
    addonIds: addons.map((a) => a.id),
    theme: inp.theme,
    notes: inp.contact.child ? `Birthday child: ${inp.contact.child}` : "",
    total: price.total,
    deposit: price.deposit,
    paid: 0,
    status: "pending",
    source: "online",
  };
  await assertSlotFree(m, { ...booking, id: "" });

  const existing = await m.tx.one<{ id: string }>("SELECT id FROM customers WHERE phone = $1 ORDER BY seq LIMIT 1", [phone]);
  let customerId = existing?.id;
  if (!customerId) {
    const cust = await m.insert("customers", {
      id: uid("c"),
      name: inp.contact.name.trim(),
      phone,
      email: inp.contact.email.trim(),
      address: "",
      member: false,
      points: 0,
      wallet: 0,
      notes: "Signed up via online booking",
      createdAt: new Date().toISOString(),
    });
    customerId = cust.id;
    await m.log("Online", "Created", `New customer from online booking: ${cust.name}`);
    if (inp.contact.child.trim()) {
      await m.insert("children", { id: uid("k"), guardianId: cust.id, name: inp.contact.child.trim(), dob: format(addDays(new Date(), -365 * 5), "yyyy-MM-dd"), gender: "other", allergies: "" });
      await m.log("Online", "Created", `Child ${inp.contact.child.trim()}`);
    }
  }
  // no payment gateway: the request holds the slot as pending until staff collect the deposit at the venue
  const bk = await m.insert("bookings", { ...booking, customerId, id: uid("b"), ref: await nextRef(m), createdAt: new Date().toISOString(), paid: 0 });
  await m.log("Bookings", "Booking request", `${bk.ref} · ${bk.kind}${bk.mode === "full" ? " (full venue)" : ""} · ${bk.date} ${bk.start} · deposit Rs. ${bk.deposit.toLocaleString()} due`);
  await alertOnlineBooking(m.tx, settings, bk, { name: inp.contact.name.trim(), phone }, m.actor.id);
  return bk;
}
