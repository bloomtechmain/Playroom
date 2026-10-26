import { differenceInYears, format, parseISO } from "date-fns";
import type { Child, Customer, Settings, Ticket, Zone } from "@/lib/types";
import { fmtTime, methodLabel, minsToLabel, money, uid } from "@/lib/utils";
import { normalizePhone, renderTemplate, whatsappSettings, type Audience, type WaMessageKind } from "@/lib/whatsapp";
import type { Sql } from "../db/pool";
import { isLinked } from "./auth";

interface NewMessage {
  kind: WaMessageKind;
  phone: string;
  body: string;
  customerId?: string;
  childId?: string;
  media?: { type: "qr"; data: string };
  campaign?: string;
  /** lower goes first: check-in / receipts (1) before birthday wishes (5) and promotions (8) */
  priority?: number;
  createdBy: string;
}

export async function enqueue(sql: Sql, m: NewMessage) {
  await sql.query(
    `INSERT INTO whatsapp_messages (id, kind, customer_id, child_id, to_phone, body, media, campaign, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [uid("wa"), m.kind, m.customerId ?? null, m.childId ?? null, m.phone, m.body, m.media ? JSON.stringify(m.media) : null, m.campaign ?? null, m.priority ?? 5, m.createdBy],
  );
}

const kidsLabel = (names: string[]) => (names.length ? (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`) : "You");

/** Welcome message with the entry QR as an image (a digital copy of the printed ticket). */
export async function queueCheckIn(sql: Sql, settings: Settings, customer: Customer, tickets: Ticket[], kids: Child[], by: string) {
  const w = whatsappSettings(settings);
  const phone = normalizePhone(customer.phone, w.countryCode);
  if (!w.sendCheckIn || !phone || !(await isLinked(sql))) return;
  const code = tickets[0].visitId ?? tickets[0].code;
  const body = renderTemplate(w.checkInTemplate, {
    name: customer.name.split(" ")[0],
    business: settings.businessName,
    kids: kidsLabel(kids.map((k) => k.name.split(" ")[0])),
    time: fmtTime(tickets[0].checkIn),
    code,
  });
  await enqueue(sql, { kind: "checkin", phone, body, customerId: customer.id, media: { type: "qr", data: code }, priority: 1, createdBy: by });
}

/** The check-out receipt as a WhatsApp message (same content as the printed visit receipt). */
export async function queueReceipt(
  sql: Sql,
  settings: Settings,
  customer: Customer,
  tickets: Ticket[],
  zones: Zone[],
  method: string,
  by: string,
) {
  const w = whatsappSettings(settings);
  const phone = normalizePhone(customer.phone, w.countryCode);
  if (!w.sendReceipt || !phone || !(await isLinked(sql))) return;
  const t = tickets[0];
  const lines = [`*${settings.businessName}* — receipt ${t.visitId ?? t.code}`, `In ${fmtTime(t.checkIn)} · Out ${fmtTime(t.checkOut!)} · ${minsToLabel(t.minutes)}`];
  for (const x of tickets) {
    const z = zones.find((y) => y.id === x.zoneId);
    lines.push("", `*${z?.name ?? ""}* · ${x.visitors} ${z?.kind === "play" ? (x.visitors === 1 ? "kid" : "kids") : x.visitors === 1 ? "person" : "people"}`);
    lines.push(`Time × ${x.visitors} — ${money(x.base)}`);
    if (x.ruleAdjust) lines.push(`${x.ruleNames.join(", ") || "Rate rules"} — ${money(x.ruleAdjust)}`);
    if (x.overtimeFee) lines.push(`Extra time — ${money(x.overtimeFee)}`);
    if (x.discount) lines.push(`Discount — -${money(x.discount)}`);
    if (x.loyaltyUsed) lines.push(`Loyalty points — -${money(x.loyaltyUsed)}`);
  }
  lines.push("", `*Total ${money(tickets.reduce((a, x) => a + x.total, 0))}* · paid by ${methodLabel[method] ?? method}`);
  if (settings.receiptFooter) lines.push(settings.receiptFooter);
  await enqueue(sql, { kind: "receipt", phone, body: lines.join("\n"), customerId: customer.id, priority: 1, createdBy: by });
}

/** Next birthday of a child on or after `from` (a date at local midnight). */
export function nextBirthday(dob: string, from: Date) {
  const d = parseISO(dob);
  let next = new Date(from.getFullYear(), d.getMonth(), d.getDate());
  if (next < from) next = new Date(from.getFullYear() + 1, d.getMonth(), d.getDate());
  return { date: next, age: differenceInYears(next, d) };
}

/** Birthday wishes for these children (once per child per year; opted-out families are skipped). */
export async function queueBirthdays(sql: Sql, settings: Settings, childIds: string[], by: string) {
  const w = whatsappSettings(settings);
  const rows = await sql.query<{ id: string; name: string; dob: string; guardian_id: string; guardian: string; phone: string; opt_out: boolean; wished: boolean }>(
    `SELECT k.id, k.name, k.dob, k.guardian_id, c.name AS guardian, c.phone, c.whatsapp_opt_out AS opt_out,
            EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.kind = 'birthday' AND m.child_id = k.id
                     AND m.status <> 'cancelled' AND m.status <> 'failed' AND date_part('year', m.created_at) = date_part('year', now())) AS wished
       FROM children k JOIN customers c ON c.id = k.guardian_id
      WHERE k.id = ANY($1::text[])`,
    [childIds],
  );
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  let queued = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r.phone, w.countryCode);
    if (r.opt_out) skipped.push(`${r.name} (family opted out)`);
    else if (!phone) skipped.push(`${r.name} (no valid phone)`);
    else if (r.wished) skipped.push(`${r.name} (already wished this year)`);
    else {
      const { age } = nextBirthday(r.dob, today);
      const body = renderTemplate(w.birthdayTemplate, { child: r.name.split(" ")[0], name: r.guardian.split(" ")[0], age, business: settings.businessName });
      await enqueue(sql, { kind: "birthday", phone, body, customerId: r.guardian_id, childId: r.id, priority: 5, createdBy: by });
      queued++;
    }
  }
  return { queued, skipped };
}

/** Today's birthdays that haven't been wished yet (for the automatic morning run). */
export async function todaysBirthdayChildIds(sql: Sql) {
  const today = format(new Date(), "MM-dd");
  const rows = await sql.query<{ id: string }>("SELECT id FROM children WHERE to_char(dob, 'MM-DD') = $1", [today]);
  return rows.map((r) => r.id);
}

/** Customers a promotion would go to: with a valid phone, not opted out, one message per number. */
export async function audienceOf(sql: Sql, settings: Settings, a: Audience) {
  const w = whatsappSettings(settings);
  let where = "NOT c.whatsapp_opt_out";
  const params: unknown[] = [];
  if (a.segment === "members") where += " AND c.member";
  if (a.segment === "recent") {
    params.push(Math.max(1, a.days ?? 30));
    where += ` AND EXISTS (SELECT 1 FROM tickets t WHERE t.customer_id = c.id AND t.check_in >= now() - make_interval(days => $${params.length}))`;
  }
  if (a.segment === "kids_age") {
    params.push(a.minAge ?? 0, a.maxAge ?? 18);
    where += ` AND EXISTS (SELECT 1 FROM children k WHERE k.guardian_id = c.id AND date_part('year', age(k.dob)) BETWEEN $${params.length - 1} AND $${params.length})`;
  }
  if (a.segment === "birthday_month") where += " AND EXISTS (SELECT 1 FROM children k WHERE k.guardian_id = c.id AND date_part('month', k.dob) = date_part('month', now()))";
  const rows = await sql.query<{ id: string; name: string; phone: string }>(`SELECT c.id, c.name, c.phone FROM customers c WHERE ${where} ORDER BY c.seq`, params);
  const seen = new Set<string>();
  const out: { id: string; name: string; phone: string }[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r.phone, w.countryCode);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({ id: r.id, name: r.name, phone });
  }
  return out;
}

export async function queueCampaign(
  sql: Sql,
  settings: Settings,
  audience: Audience,
  template: string,
  promo: { code: string; name: string } | undefined,
  campaign: string,
  by: string,
) {
  const w = whatsappSettings(settings);
  const people = await audienceOf(sql, settings, audience);
  for (const p of people) {
    const body = renderTemplate(template, { name: p.name.split(" ")[0], business: settings.businessName, code: promo?.code, promo: promo?.name }) + (w.promoFooter ? `\n\n_${w.promoFooter}_` : "");
    await enqueue(sql, { kind: "promotion", phone: p.phone, body, customerId: p.id, campaign, priority: 8, createdBy: by });
  }
  return people.length;
}
