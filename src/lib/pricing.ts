import type { Booking, Child, PriceRule, Promotion, RatePlan, Settings, Ticket, Zone } from "./types";
import { ageOf, dkey, timeToMin } from "./utils";
import { format } from "date-fns";

export interface PriceContext {
  at: Date;
  zone: Zone;
  plan: RatePlan;
  visitors: number;
  adults: number;
  childAges: number[];
  member: boolean;
  priorVisits: number;
}

export function rulesFor(rules: PriceRule[], settings: Settings, zoneId: string, at: Date) {
  const day = at.getDay();
  const mins = at.getHours() * 60 + at.getMinutes();
  const date = dkey(at);
  const isHoliday = settings.holidays.some((h) => h.date === date);
  return rules.filter((r) => {
    if (!r.active || (r.zoneIds.length && !r.zoneIds.includes(zoneId))) return false;
    const inTime = mins >= timeToMin(r.start) && mins < timeToMin(r.end);
    switch (r.kind) {
      case "holiday":
        return isHoliday && inTime;
      case "event":
        return r.date === date && inTime;
      default:
        // weekday/weekend rules don't stack on holidays
        if (isHoliday && (r.kind === "weekday" || r.kind === "weekend")) return false;
        return r.days.includes(day) && inTime;
    }
  });
}

export function promoEligible(p: Promotion, ctx: PriceContext, subtotal: number): string | null {
  const date = dkey(ctx.at);
  if (!p.active) return "Promotion is inactive";
  if (date < p.validFrom || date > p.validTo) return "Outside validity dates";
  if (p.usageCap && p.used >= p.usageCap) return "Usage cap reached";
  if (p.zoneIds.length && !p.zoneIds.includes(ctx.zone.id)) return "Not valid for this zone";
  const t = p.targeting;
  if (t.minSpend && subtotal < t.minSpend) return `Minimum spend Rs. ${t.minSpend.toLocaleString()}`;
  if (t.minVisitors && ctx.visitors < t.minVisitors) return `Needs ${t.minVisitors}+ visitors`;
  if (t.membersOnly && !ctx.member) return "Members only";
  if (t.minPriorVisits && ctx.priorVisits < t.minPriorVisits) return `Needs ${t.minPriorVisits}+ prior visits`;
  if (t.childMinAge != null || t.childMaxAge != null) {
    const ok = ctx.childAges.some(
      (a) => (t.childMinAge == null || a >= t.childMinAge) && (t.childMaxAge == null || a <= t.childMaxAge),
    );
    if (!ok) return `Child age ${t.childMinAge ?? 0}–${t.childMaxAge ?? "+"} only`;
  }
  if (p.type === "package" && p.packageKids && ctx.visitors !== p.packageKids)
    return `Package is for exactly ${p.packageKids} visitors`;
  return null;
}

export function promoDiscount(p: Promotion, subtotal: number) {
  switch (p.type) {
    case "percent":
      return Math.round((subtotal * p.value) / 100);
    case "fixed":
      return Math.min(p.value, subtotal);
    case "package":
      return Math.max(0, subtotal - p.value);
    default:
      return 0;
  }
}

export function quote(
  ctx: PriceContext,
  rules: PriceRule[],
  settings: Settings,
  promo: Promotion | undefined,
  pointsToUse: number,
  adultFee = 0,
) {
  const base = ctx.plan.price * Math.max(1, ctx.visitors) + adultFee * ctx.adults;
  const applied = rulesFor(rules, settings, ctx.zone.id, ctx.at);
  let ruleAdjust = 0;
  for (const r of applied) {
    ruleAdjust += r.adjust === "percent" ? Math.round((base * r.value) / 100) : r.value * Math.max(1, ctx.visitors);
  }
  const subtotal = Math.max(0, base + ruleAdjust);
  let discount = 0;
  let bonusMinutes = 0;
  let promoError: string | null = null;
  if (promo) {
    promoError = promoEligible(promo, ctx, subtotal);
    if (!promoError) {
      discount = promoDiscount(promo, subtotal);
      if (promo.type === "bonus_time") bonusMinutes = promo.value;
    }
  }
  const afterPromo = subtotal - discount;
  const loyaltyValue = Math.min(afterPromo, Math.floor(pointsToUse) * settings.pointValue);
  const total = Math.max(0, afterPromo - loyaltyValue);
  return {
    base,
    applied,
    ruleAdjust,
    subtotal,
    discount,
    bonusMinutes,
    promoError,
    loyaltyValue,
    pointsUsed: settings.pointValue ? Math.ceil(loyaltyValue / settings.pointValue) : 0,
    total,
    minutes: ctx.plan.minutes + bonusMinutes,
  };
}

export function overtimeFor(t: Ticket, plan: RatePlan | undefined, now = new Date()) {
  const elapsed = Math.max(0, (now.getTime() - new Date(t.checkIn).getTime()) / 60000);
  if (!plan) return { elapsed, over: 0, blocks: 0, fee: 0 };
  const over = Math.max(0, elapsed - t.minutes - plan.graceMinutes);
  const blocks = over > 0 ? Math.ceil(over / plan.overtimeBlock) : 0;
  return { elapsed, over, blocks, fee: blocks * plan.overtimePrice * Math.max(1, t.visitors) };
}

/** Is the play area locked by a full-venue party right now (or at a given time)? */
export function lockoutAt(bookings: Booking[], at: Date) {
  const date = dkey(at);
  const m = at.getHours() * 60 + at.getMinutes();
  return bookings.find(
    (b) =>
      b.kind === "party" &&
      b.mode === "full" &&
      b.status === "confirmed" &&
      b.date === date &&
      m >= timeToMin(b.start) - 30 &&
      m < timeToMin(b.end),
  );
}

export function lockoutsOverlapping(bookings: Booking[], date: string, start: string, end: string, ignoreId?: string) {
  const s = timeToMin(start);
  const e = timeToMin(end);
  return bookings.filter(
    (b) =>
      b.id !== ignoreId &&
      b.kind === "party" &&
      b.mode === "full" &&
      (b.status === "confirmed" || b.status === "pending") &&
      b.date === date &&
      s < timeToMin(b.end) &&
      e > timeToMin(b.start),
  );
}

export const hhmm = (d: Date) => format(d, "HH:mm");

// ---------------------------------------------------------------- open-ended visits

/**
 * Visits have no fixed length: at check-out the stay is charged with whichever of the zone's rate plans
 * comes out cheapest for the time actually spent — the plan's price, plus extra blocks once the plan's
 * minutes and grace period are used up.
 */
export function bestRate(plans: RatePlan[], minutes: number) {
  let best: { plan: RatePlan; blocks: number; perVisitor: number } | undefined;
  for (const plan of plans) {
    const over = Math.max(0, minutes - plan.minutes - plan.graceMinutes);
    const blocks = over > 0 ? Math.ceil(over / Math.max(1, plan.overtimeBlock)) : 0;
    const perVisitor = plan.price + blocks * plan.overtimePrice;
    // on a tie prefer the plan that includes more time (reads better on the receipt)
    if (!best || perVisitor < best.perVisitor || (perVisitor === best.perVisitor && plan.minutes > best.plan.minutes)) best = { plan, blocks, perVisitor };
  }
  return best;
}

/** What one area of a visit costs if the family leaves at `now`. */
export interface StayQuote {
  plan?: RatePlan;
  /** minutes since check-in */
  minutes: number;
  /** minutes actually charged (bonus-time promotions are free) */
  chargedMinutes: number;
  blocks: number;
  base: number;
  extra: number;
  applied: PriceRule[];
  ruleAdjust: number;
  discount: number;
  promo?: Promotion;
  promoError: string | null;
  bonusMinutes: number;
  total: number;
}

export interface StayInput {
  ticket: Pick<Ticket, "zoneId" | "checkIn" | "visitors" | "adults">;
  zone: Zone;
  /** the zone's active rate plans */
  plans: RatePlan[];
  childAges: number[];
  member: boolean;
  priorVisits: number;
}

function priceStay(inp: StayInput, rules: PriceRule[], settings: Settings, now: Date, bonusMinutes: number, waiveExtra: boolean) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(inp.ticket.checkIn).getTime()) / 60000));
  const chargedMinutes = Math.max(0, minutes - bonusMinutes);
  const best = bestRate(inp.plans, chargedMinutes);
  const visitors = Math.max(1, inp.ticket.visitors);
  const base = best ? best.plan.price * visitors : 0;
  const extra = best && !waiveExtra ? best.blocks * best.plan.overtimePrice * visitors : 0;
  // day / time rules use the time the family arrived
  const applied = rulesFor(rules, settings, inp.zone.id, new Date(inp.ticket.checkIn));
  const ruleAdjust = applied.reduce((a, r) => a + (r.adjust === "percent" ? Math.round((base * r.value) / 100) : r.value * visitors), 0);
  return { plan: best?.plan, minutes, chargedMinutes, blocks: best?.blocks ?? 0, base, extra, applied, ruleAdjust };
}

/**
 * Price one area of a visit at check-out. `promoChoice`: undefined/null = the automatic promotion
 * that saves the most, "" = none, an id = that promotion (if it qualifies).
 */
export function stayQuote(
  inp: StayInput,
  rules: PriceRule[],
  settings: Settings,
  promos: Promotion[],
  now: Date,
  opts: { promoChoice?: string | null; waiveExtra?: boolean } = {},
): StayQuote {
  const waive = !!opts.waiveExtra;
  const plain = priceStay(inp, rules, settings, now, 0, waive);
  const subtotal = Math.max(0, plain.base + plain.ruleAdjust);
  const ctx: PriceContext = {
    at: new Date(inp.ticket.checkIn),
    zone: inp.zone,
    plan: plain.plan ?? inp.plans[0],
    visitors: inp.ticket.visitors,
    adults: inp.ticket.adults,
    childAges: inp.childAges,
    member: inp.member,
    priorVisits: inp.priorVisits,
  };

  const withPromo = (promo: Promotion | undefined, promoError: string | null = null): StayQuote => {
    const bonusMinutes = promo?.type === "bonus_time" ? promo.value : 0;
    const q = bonusMinutes ? priceStay(inp, rules, settings, now, bonusMinutes, waive) : plain;
    const sub = Math.max(0, q.base + q.ruleAdjust);
    const discount = promo && promo.type !== "bonus_time" ? promoDiscount(promo, sub) : 0;
    return { ...q, discount, promo, promoError, bonusMinutes, total: Math.max(0, sub - discount) + q.extra };
  };

  if (opts.promoChoice) {
    const promo = promos.find((p) => p.id === opts.promoChoice);
    const err = promo ? promoEligible(promo, ctx, subtotal) : "Promotion not found";
    return err ? withPromo(undefined, err) : withPromo(promo);
  }
  let best = withPromo(undefined);
  if (opts.promoChoice === "") return best;
  for (const p of promos) {
    if (!p.auto || promoEligible(p, ctx, subtotal)) continue;
    const q = withPromo(p);
    if (q.total < best.total) best = q;
  }
  return best;
}

/** Everything stayQuote needs about one ticket, from the app's collections (same on screen and on the server). */
export function stayInputFor(
  t: Ticket,
  data: { zones: Zone[]; ratePlans: RatePlan[]; children: Child[] },
  member: boolean,
  priorVisits: number,
): StayInput | undefined {
  const zone = data.zones.find((z) => z.id === t.zoneId);
  if (!zone) return undefined;
  return {
    ticket: t,
    zone,
    plans: data.ratePlans.filter((p) => p.zoneId === zone.id && p.active),
    childAges: data.children.filter((k) => t.childIds.includes(k.id)).map((k) => ageOf(k.dob)),
    member,
    priorVisits,
  };
}

/** The tickets of one visit (play + co-work check in together and leave together). */
export const visitOf = (t: Ticket, tickets: Ticket[]) => (t.visitId ? tickets.filter((x) => x.visitId === t.visitId) : [t]);

/** Minutes a finished visit lasted (older tickets may not have it stored). */
export const stayMinutes = (t: Ticket) => t.minutes || (t.checkOut ? Math.round((new Date(t.checkOut).getTime() - new Date(t.checkIn).getTime()) / 60000) : 0);
