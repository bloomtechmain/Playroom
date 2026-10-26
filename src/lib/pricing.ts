import type { Booking, Child, PriceRule, Promotion, RatePlan, Settings, Ticket, Zone } from "./types";
import { ageOf, dkey, timeToMin } from "./utils";
import { format } from "date-fns";

export interface PriceContext {
  at: Date;
  zone: Zone;
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
 * Visits have no fixed length: at check-out the time actually spent is charged in 30-minute blocks,
 * rounded up, with one block as the minimum (1h 20m is charged as 1h 30m), at the zone's price per block.
 */
export const BLOCK_MINUTES = 30;
export const blocksFor = (minutes: number) => Math.max(1, Math.ceil(minutes / BLOCK_MINUTES));

/** The zone's rate — one price per 30 minutes, per child (play) or per person (co-work). */
export const zoneRate = (plans: RatePlan[], zoneId: string) => plans.find((p) => p.zoneId === zoneId && p.active);

/** What one area of a visit costs if the family leaves at `now`. */
export interface StayQuote {
  plan?: RatePlan;
  /** minutes since check-in */
  minutes: number;
  /** minutes actually charged (bonus-time promotions are free) */
  chargedMinutes: number;
  /** 30-minute blocks charged */
  blocks: number;
  /** children / people for the time, plus guardians (`guardianFee`) */
  base: number;
  /** accompanying adults in the play area, when Settings charges for them (included in `base`) */
  guardianFee: number;
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
  /** the zone's active rate */
  plan?: RatePlan;
  childAges: number[];
  member: boolean;
  priorVisits: number;
}

function priceStay(inp: StayInput, rules: PriceRule[], settings: Settings, now: Date, bonusMinutes: number) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(inp.ticket.checkIn).getTime()) / 60000));
  const chargedMinutes = Math.max(0, minutes - bonusMinutes);
  // a stay that bonus time covers completely is free; otherwise the first block is the minimum
  const blocks = inp.plan && !(bonusMinutes && !chargedMinutes) ? blocksFor(chargedMinutes) : 0;
  const visitors = Math.max(1, inp.ticket.visitors);
  const adultPrice = inp.plan && inp.zone.kind === "play" ? guardianPrice(settings, inp.plan.price) : 0;
  const guardianFee = blocks * adultPrice * Math.max(0, inp.ticket.adults);
  const base = (inp.plan ? blocks * inp.plan.price * visitors : 0) + guardianFee;
  // day / time rules use the time the family arrived
  const applied = rulesFor(rules, settings, inp.zone.id, new Date(inp.ticket.checkIn));
  const ruleAdjust = applied.reduce((a, r) => a + (r.adjust === "percent" ? Math.round((base * r.value) / 100) : r.value * visitors), 0);
  return { plan: inp.plan, minutes, chargedMinutes, blocks, base, guardianFee, applied, ruleAdjust };
}

/** What one accompanying adult pays per 30 min in a play zone whose child rate is `childPrice` (0 = free). */
export function guardianPrice(settings: Settings, childPrice: number) {
  const g = settings.guardianRate;
  if (!g?.enabled || !(g.value > 0)) return 0;
  return g.type === "percent" ? Math.round((childPrice * Math.min(100, g.value)) / 100) : g.value;
}

/**
 * Play + co-work in one visit: the combo discount from Settings, as a share per area (in visit order).
 * `totals` are what each area costs after its promotion.
 */
export function comboShares(settings: Settings, areas: { kind: Zone["kind"]; total: number }[]) {
  const c = settings.comboDiscount;
  const combo = areas.some((a) => a.kind === "play") && areas.some((a) => a.kind === "cowork");
  if (!combo || !c?.enabled || !(c.value > 0)) return areas.map(() => 0);
  if (c.type === "percent") return areas.map((a) => Math.round((a.total * Math.min(100, c.value)) / 100));
  let left = c.value;
  return areas.map((a) => {
    const take = Math.min(a.total, Math.max(0, left));
    left -= take;
    return take;
  });
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
  opts: { promoChoice?: string | null } = {},
): StayQuote {
  const plain = priceStay(inp, rules, settings, now, 0);
  const subtotal = Math.max(0, plain.base + plain.ruleAdjust);
  const ctx: PriceContext = {
    at: new Date(inp.ticket.checkIn),
    zone: inp.zone,
    visitors: inp.ticket.visitors,
    adults: inp.ticket.adults,
    childAges: inp.childAges,
    member: inp.member,
    priorVisits: inp.priorVisits,
  };

  const withPromo = (promo: Promotion | undefined, promoError: string | null = null): StayQuote => {
    const bonusMinutes = promo?.type === "bonus_time" ? promo.value : 0;
    const q = bonusMinutes ? priceStay(inp, rules, settings, now, bonusMinutes) : plain;
    const sub = Math.max(0, q.base + q.ruleAdjust);
    const discount = promo && promo.type !== "bonus_time" ? promoDiscount(promo, sub) : 0;
    return { ...q, discount, promo, promoError, bonusMinutes, total: Math.max(0, sub - discount) };
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
    plan: zoneRate(data.ratePlans, zone.id),
    childAges: data.children.filter((k) => t.childIds.includes(k.id)).map((k) => ageOf(k.dob)),
    member,
    priorVisits,
  };
}

/** The tickets of one visit (play + co-work check in together and leave together). */
export const visitOf = (t: Ticket, tickets: Ticket[]) => (t.visitId ? tickets.filter((x) => x.visitId === t.visitId) : [t]);

/** Minutes a finished visit lasted (older tickets may not have it stored). */
export const stayMinutes = (t: Ticket) => t.minutes || (t.checkOut ? Math.round((new Date(t.checkOut).getTime() - new Date(t.checkIn).getTime()) / 60000) : 0);
