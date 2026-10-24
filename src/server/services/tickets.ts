import "server-only";
import { format } from "date-fns";
import { lockoutAt, stayInputFor, stayQuote } from "@/lib/pricing";
import type { PayMethod } from "@/lib/types";
import { minsToLabel, uid } from "@/lib/utils";
import { badRequest, HttpError } from "../http";
import type { Mut } from "../mutation";
import { readCollection } from "../snapshot";
import { queueCheckIn, queueReceipt } from "../whatsapp/messages";
import { chargeWallet, earnAndRedeemPoints } from "./money";
import { requestRefund, decideRefund } from "./refunds";

export interface CheckInInput {
  customerId: string;
  /** children playing (play area) */
  childIds: string[];
  /** accompanying adults in the play area (free, counted for safety) */
  adults: number;
  /** one or two areas: a play zone and/or a co-work zone, with how many visitors each */
  areas: { zoneId: string; visitors: number }[];
}

const areaLabel = (kind: string, n: number) => (kind === "play" ? `play area (${n} kid${n === 1 ? "" : "s"})` : `co-work (${n} ${n === 1 ? "person" : "people"})`);

/**
 * Check-in records who came in and when — no duration or price. Play + co-work creates one ticket per
 * area sharing a visit id; the family gets one QR (the first ticket's code) and leaves together.
 */
export async function checkIn(m: Mut, inp: CheckInInput) {
  const customer = await m.get("customers", inp.customerId, "Customer");
  if (!inp.areas.length || inp.areas.length > 2) throw badRequest("Choose the play area, co-work, or both");
  const zones = await Promise.all(inp.areas.map((a) => m.get("zones", a.zoneId, "Zone")));
  if (zones.some((z) => z.kind === "party")) throw badRequest("The party room is booked through Bookings, not checked into at the desk");
  if (new Set(zones.map((z) => z.kind)).size !== zones.length) throw badRequest("Choose one play area and/or one co-work zone");

  const today = format(new Date(), "yyyy-MM-dd");
  for (const [i, zone] of zones.entries()) {
    const visitors = zone.kind === "play" ? inp.childIds.length : inp.areas[i].visitors;
    if (!zone.active) throw badRequest(`${zone.name} is closed`);
    if (visitors < 1) throw badRequest(zone.kind === "play" ? "Select the children who are playing" : "Enter how many people are working");
    if (zone.kind === "play") {
      const lock = lockoutAt(await m.rows("bookings", "SELECT * FROM bookings WHERE date = $1 AND kind = 'party'", [today]), new Date());
      if (lock) throw badRequest(`Locked for exclusive party ${lock.ref} until ${lock.end}`);
    }
    // capacity is re-checked here so two counters can't both sell the last spot
    await m.lock(`zone:${zone.id}`);
    const { inside } = (await m.tx.one<{ inside: number }>("SELECT coalesce(sum(visitors), 0)::int AS inside FROM tickets WHERE zone_id = $1 AND status = 'active'", [zone.id]))!;
    if (inside + visitors > zone.capacity) throw badRequest(`${zone.name} is full (${inside}/${zone.capacity})`);
  }

  await m.lock("ticket-code");
  const prefix = `PR${format(new Date(), "yyMMdd")}-`;
  const { n } = (await m.tx.one<{ n: number }>("SELECT count(*)::int AS n FROM tickets WHERE code LIKE $1", [`${prefix}%`]))!;
  const at = new Date().toISOString();
  const visitId = `${prefix}${String(n + 1).padStart(4, "0")}`;
  const out = [];
  for (const [i, zone] of zones.entries()) {
    const play = zone.kind === "play";
    out.push(
      await m.insert("tickets", {
        id: uid("tk"),
        code: `${prefix}${String(n + 1 + i).padStart(4, "0")}`,
        visitId,
        customerId: customer.id,
        childIds: play ? inp.childIds : [],
        visitors: play ? inp.childIds.length : inp.areas[i].visitors,
        adults: play ? inp.adults : 0,
        zoneId: zone.id,
        minutes: 0,
        checkIn: at,
        status: "active",
        base: 0,
        ruleAdjust: 0,
        ruleNames: [],
        discount: 0,
        loyaltyUsed: 0,
        overtimeFee: 0,
        total: 0,
        paid: 0,
        createdBy: m.actor.id,
        reprints: 0,
      }),
    );
  }
  await m.log("Tickets", "Checked in", `${visitId} · ${customer.name} · ${out.map((t, i) => areaLabel(zones[i].kind, t.visitors)).join(" + ")}`);
  // WhatsApp welcome with the QR (sent by the background worker if WhatsApp is linked)
  const kids = inp.childIds.length ? await m.rows("children", "SELECT * FROM children WHERE id = ANY($1::text[]) ORDER BY seq", [inp.childIds]) : [];
  await queueCheckIn(m.tx, await m.settings(), customer, out, kids, m.actor.id);
  return out;
}

export interface CheckoutOptions {
  method: PayMethod;
  /** waive the extra-time blocks (manager) */
  waive: boolean;
  points: number;
  /** undefined/null = best automatic promotion, "" = none, id = that promotion */
  promoId?: string | null;
  /** manual discount for the whole visit (needs the price override permission) */
  manualDiscount?: number;
}

/** Spread an amount over the tickets of a visit, in order, without taking any ticket below zero. */
function allocate(amount: number, caps: number[]) {
  let left = amount;
  return caps.map((cap) => {
    const take = Math.min(cap, Math.max(0, left));
    left -= take;
    return take;
  });
}

/** Check out a whole visit: measure the time, price every area, take one payment. */
export async function checkoutVisit(m: Mut, id: string, opts: CheckoutOptions) {
  const first = await m.get("tickets", id, "Ticket", { lock: true });
  if (first.status !== "active") throw badRequest(`${first.code} is already ${first.status}`);
  const visit = first.visitId
    ? await m.rows("tickets", "SELECT * FROM tickets WHERE visit_id = $1 AND status = 'active' ORDER BY seq FOR UPDATE", [first.visitId])
    : [first];
  const manual = Math.max(0, opts.manualDiscount ?? 0);
  if (opts.waive && !m.actor.can("price.override")) throw new HttpError(403, "Waiving extra time needs the price override permission");
  const settings = await m.settings();
  if (manual > 0 && !m.actor.can("price.override") && settings.priceEditNeedsPermission) throw new HttpError(403, "Manual discounts need the “Override price” permission");

  const [zones, ratePlans, rules, promotions] = await Promise.all([
    readCollection(m.tx, "zones"),
    readCollection(m.tx, "ratePlans"),
    readCollection(m.tx, "rules"),
    readCollection(m.tx, "promotions"),
  ]);
  const cust = await m.find("customers", first.customerId, { lock: true });
  const children = await m.rows("children", "SELECT * FROM children WHERE guardian_id = $1", [first.customerId]);
  const { prior } = (await m.tx.one<{ prior: number }>(
    "SELECT count(*)::int AS prior FROM tickets WHERE customer_id = $1 AND status <> 'cancelled' AND id <> ALL($2::text[])",
    [first.customerId, visit.map((t) => t.id)],
  ))!;

  const now = new Date();
  const quotes = visit.map((t) => {
    const inp = stayInputFor(t, { zones, ratePlans, children }, !!cust?.member, prior);
    const q = inp && stayQuote(inp, rules, settings, promotions, now, { promoChoice: opts.promoId, waiveExtra: opts.waive });
    if (!q?.plan) throw badRequest(`${zones.find((z) => z.id === t.zoneId)?.name ?? "This zone"} has no active rate — add one in Pricing`);
    return q;
  });

  const gross = quotes.reduce((a, q) => a + q.total, 0);
  const manualShares = allocate(Math.min(manual, gross), quotes.map((q) => q.total));
  const afterManual = gross - manualShares.reduce((a, b) => a + b, 0);
  const loyalty = Math.min(afterManual, Math.max(0, Math.min(opts.points, cust?.points ?? 0)) * settings.pointValue);
  const loyaltyShares = allocate(loyalty, quotes.map((q, i) => q.total - manualShares[i]));
  const due = afterManual - loyalty;

  if (cust) {
    if (opts.method === "wallet") await chargeWallet(m, cust, due);
    await earnAndRedeemPoints(m, cust.id, Math.ceil(loyalty / (settings.pointValue || 1)), due, settings);
  }

  const out = [];
  for (const [i, t] of visit.entries()) {
    const q = quotes[i];
    const final = q.total - manualShares[i] - loyaltyShares[i];
    // discounts come off the time charge first; what is left of the extra time is reported as overtime
    const extra = Math.min(q.extra, final);
    const session = final - extra;
    out.push(
      await m.update("tickets", t.id, {
        status: "completed",
        checkOut: now.toISOString(),
        ratePlanId: q.plan!.id,
        minutes: q.minutes,
        base: q.base,
        ruleAdjust: q.ruleAdjust,
        ruleNames: q.applied.map((r) => r.name),
        promoId: q.promo?.id,
        discount: q.discount + manualShares[i],
        loyaltyUsed: loyaltyShares[i],
        overtimeFee: extra,
        total: final,
        paid: final,
      }),
    );
    const kind = zones.find((z) => z.id === t.zoneId)?.kind === "cowork" ? "cowork" : "play";
    const discount = q.discount + manualShares[i] + loyaltyShares[i];
    if (session > 0) await m.addTx({ type: kind, method: opts.method, amount: session, ref: t.id, refLabel: t.code, customerId: t.customerId, discount });
    if (extra > 0) await m.addTx({ type: "overtime", method: opts.method, amount: extra, ref: t.id, refLabel: t.code, customerId: t.customerId, discount: 0 });
  }
  for (const q of quotes) {
    if (!q.promo) continue;
    const p = await m.get("promotions", q.promo.id, "Promotion", { lock: true });
    await m.update("promotions", p.id, { used: p.used + 1 });
  }

  await m.log(
    "Tickets",
    "Checked out & paid",
    `${first.visitId ?? first.code} · ${minsToLabel(quotes[0].minutes)} · Rs. ${due.toLocaleString()}${quotes.some((q) => q.extra) ? " incl. extra time" : ""}${opts.waive ? " · extra time waived" : ""}${loyalty ? ` · ${loyalty} pts redeemed` : ""}`,
  );
  if (cust) await queueReceipt(m.tx, settings, cust, out, zones, ratePlans, opts.method, m.actor.id);
  if (manual > 0) await m.log("Pricing", "Price override", `${first.visitId ?? first.code} · manual discount Rs. ${Math.min(manual, gross).toLocaleString()} — ${cust?.name ?? ""}`);
  return out;
}

/** Cancel a ticket; anything already paid goes through the refund flow (auto-approved when allowed). */
export async function cancelTicket(m: Mut, id: string, reason: string, refundMethod?: PayMethod) {
  const t = await m.get("tickets", id, "Ticket", { lock: true });
  if (t.status === "cancelled" || t.status === "refunded") throw badRequest(`${t.code} is already ${t.status}`);
  await m.update("tickets", id, { status: "cancelled", checkOut: t.checkOut ?? new Date().toISOString() });
  await m.log("Tickets", "Cancelled ticket", `${t.code} — ${reason}`);
  if (t.paid > 0) {
    const settings = await m.settings();
    const req = await requestRefund(m, {
      target: "ticket",
      targetId: t.id,
      label: t.code,
      maxAmount: t.paid,
      amount: t.paid,
      full: true,
      category: "cancelled",
      reason: `Cancelled: ${reason}`,
      method: refundMethod ?? "cash",
    });
    if (m.actor.can("refunds.approve") || !settings.refundNeedsApproval) await decideRefund(m, req.id, true);
    // the ticket was cancelled, not just refunded
    await m.update("tickets", id, { status: "cancelled" });
  }
}

export async function reprintTicket(m: Mut, id: string) {
  const t = await m.get("tickets", id, "Ticket");
  await m.update("tickets", id, { reprints: t.reprints + 1 });
  await m.log("Tickets", "Reprinted", `${t.code} (copy #${t.reprints + 1})`);
}
