import { z } from "zod";
import type { CollectionKey } from "./collections";

/**
 * Field rules for records saved through the generic save (`/api/records/<collection>`), so a bad value is
 * a clear 400 instead of whatever the database makes of it. Unknown fields are dropped. Optional fields
 * accept null (= clear it), as the client and `toItem` treat absent and null alike.
 */
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1, "can't be empty").max(200);
const text = (max = 2000) => z.string().max(max);
const opt = <T extends z.ZodType>(t: T) => t.nullish();
const money = z.number().finite().min(0).max(100_000_000);
const count = (max = 1_000_000) => z.number().int().min(0).max(max);
const pct = z.number().finite().min(0).max(100);
const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "expected HH:mm");
const ymd = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "expected yyyy-MM-dd");
const iso = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "expected a date and time");
const ids = z.array(id).max(500);
const payItem = z.object({ name: text(120), amount: money, epf: opt(z.boolean()) });

const SCHEMAS: Partial<Record<CollectionKey, z.ZodType>> = {
  roles: z.object({ id, name, description: text(500), permissions: z.array(z.string().max(60)).max(200) }),
  users: z.object({
    id,
    name,
    username: z.string().trim().min(1).max(60).regex(/^\S+$/, "no spaces"),
    email: text(200),
    phone: text(30),
    roleId: id,
    active: z.boolean(),
    password: opt(z.string().max(200)),
    mustChangePassword: opt(z.boolean()),
    lastLogin: opt(iso),
    createdAt: iso,
    employeeId: opt(id),
  }),
  zones: z.object({
    id,
    name,
    kind: z.enum(["play", "party", "cowork"]),
    capacity: count(10_000),
    nearFullPct: pct,
    openTime: hhmm,
    closeTime: hhmm,
    minAge: opt(count(120)),
    maxAge: opt(count(120)),
    rules: text(),
    active: z.boolean(),
    color: text(40),
  }),
  ratePlans: z.object({ id, zoneId: id, price: money, active: z.boolean() }),
  rules: z.object({
    id,
    name,
    kind: z.enum(["weekday", "weekend", "peak", "offpeak", "holiday", "event"]),
    days: z.array(z.number().int().min(0).max(6)).max(7),
    start: hhmm,
    end: hhmm,
    date: opt(ymd),
    adjust: z.enum(["percent", "fixed"]),
    // + surcharge / − discount
    value: z.number().finite().min(-100_000_000).max(100_000_000),
    zoneIds: ids,
    active: z.boolean(),
  }),
  promotions: z.object({
    id,
    code: text(40),
    name,
    type: z.enum(["percent", "fixed", "package", "bonus_time"]),
    value: money,
    packageKids: opt(count(1000)),
    validFrom: ymd,
    validTo: ymd,
    usageCap: count(),
    used: count(),
    auto: z.boolean(),
    active: z.boolean(),
    zoneIds: ids,
    targeting: z.object({
      minSpend: opt(money),
      minVisitors: opt(count(1000)),
      childMinAge: opt(count(120)),
      childMaxAge: opt(count(120)),
      membersOnly: opt(z.boolean()),
      minPriorVisits: opt(count()),
    }),
  }),
  customers: z.object({
    id,
    name,
    phone: text(30),
    email: text(200),
    address: text(500),
    member: z.boolean(),
    points: count(100_000_000),
    wallet: z.number().finite(),
    notes: text(),
    whatsappOptOut: opt(z.boolean()),
    createdAt: opt(iso),
  }),
  children: z.object({ id, guardianId: id, name, dob: ymd, gender: z.enum(["girl", "boy", "other"]), allergies: text(500) }),
  products: z.object({ id, name, category: text(100), sku: text(100), price: money, cost: money, stock: z.number().int().min(-1_000_000).max(10_000_000), reorderAt: count(10_000_000), active: z.boolean() }),
  packages: z.object({
    id,
    name,
    roomZoneId: id,
    guestLimit: count(1000),
    durationMin: z.number().int().min(15).max(24 * 60),
    priceRoomOnly: money,
    priceFullVenue: money,
    extraGuestPrice: money,
    depositPct: pct,
    includes: z.array(text(200)).max(100),
    active: z.boolean(),
    overtimeRoomPerHour: opt(money),
    overtimeFullPerHour: opt(money),
    overtimeGraceMin: opt(count(240)),
  }),
  addons: z.object({ id, name, kind: z.enum(["addon", "food", "decor"]), price: money, perHead: z.boolean(), active: z.boolean() }),
  bookings: z.object({
    id,
    ref: text(40),
    kind: z.enum(["play", "party", "cowork"]),
    mode: opt(z.enum(["room", "full"])),
    customerId: id,
    date: ymd,
    start: hhmm,
    end: hhmm,
    zoneId: id,
    packageId: opt(id),
    guests: count(1000),
    kids: count(1000),
    addonIds: ids,
    theme: text(200),
    notes: text(),
    total: money,
    adjustment: opt(z.number().finite().min(-100_000_000).max(100_000_000)),
    deposit: money,
    paid: money,
    status: z.enum(["pending", "confirmed", "completed", "cancelled"]),
    source: z.enum(["walkin", "online", "phone"]),
    createdAt: iso,
  }),
  expenses: z.object({
    id,
    date: ymd,
    category: text(100),
    description: text(500),
    vendor: text(200),
    amount: money,
    paidFrom: z.enum(["cash", "bank"]),
    payrollRunId: opt(id),
    createdBy: opt(id),
  }),
  employees: z.object({
    id,
    code: text(40),
    name,
    designation: text(120),
    phone: text(30),
    nic: text(30),
    joinDate: ymd,
    basic: money,
    employmentType: opt(z.enum(["permanent", "non_permanent", "part_time"])),
    payBasis: opt(z.enum(["monthly", "daily", "hourly"])),
    rate: opt(money),
    allowances: z.array(payItem).max(50),
    deductions: z.array(payItem).max(50),
    otRate: money,
    epf: z.boolean(),
    etf: z.boolean(),
    epfNo: text(40),
    bank: text(200),
    active: z.boolean(),
    qrToken: text(100),
    color: text(40),
    qualifications: opt(z.array(z.object({ id, title: name, institution: text(200), year: text(20), notes: opt(text(1000)) })).max(100)),
    workHours: opt(z.object({ start: hhmm, end: hhmm, days: z.array(z.number().int().min(0).max(6)).max(7), graceMin: z.number().int().min(0).max(240) })),
  }),
  // arrival fields are worked out on the server; whatever the browser sends is replaced
  attendance: z.object({ id, employeeId: id, date: ymd, clockIn: iso, clockOut: opt(iso), method: z.enum(["qr", "manual"]) }),
  trainings: z.object({
    id,
    title: name,
    date: ymd,
    trainer: text(200),
    hours: z.number().finite().min(0).max(1000),
    description: text(4000),
    employeeIds: z.array(id).max(1000),
  }),
  evaluations: z.object({
    id,
    employeeId: id,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected yyyy-MM"),
    scores: z.record(z.string().max(100), z.number().finite().min(0).max(10)),
    notes: text(4000),
    evaluatedBy: opt(z.string().max(100)),
    at: opt(iso),
  }),
  payroll: z.object({
    id,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected yyyy-MM"),
    status: z.enum(["draft", "paid"]),
    lines: z
      .array(
        z.object({
          employeeId: id,
          basic: money,
          payBasis: opt(z.enum(["monthly", "daily", "hourly"])),
          units: opt(z.number().finite().min(0).max(744)),
          rate: opt(money),
          allowance: money,
          allowances: opt(z.array(payItem).max(50)),
          otHours: z.number().finite().min(0).max(744),
          otPay: money,
          deductions: money,
          deductionItems: opt(z.array(payItem).max(50)),
          gross: money,
          epfEmployee: money,
          epfEmployer: money,
          etfEmployer: money,
          net: z.number().finite().min(-100_000_000).max(100_000_000),
          epf: z.boolean(),
          etf: z.boolean(),
        }),
      )
      .max(1000),
    createdAt: iso,
    paidAt: opt(iso),
    createdBy: opt(id),
  }),
};

/** Validate and clean a record for the generic save (collections without rules pass through unchanged). */
export function parseRecord(key: CollectionKey, item: unknown): Record<string, unknown> {
  const schema = SCHEMAS[key];
  return (schema ? schema.parse(item) : item) as Record<string, unknown>;
}

/** Rules for the settings keys that drive money and payroll; other keys only get the 1 MB body cap. */
const rate = z.object({ enabled: z.boolean(), type: z.enum(["percent", "fixed"]), value: money });
export const settingsPatch = z
  .object({
    businessName: text(200),
    address: text(500),
    phone: text(60),
    email: text(200),
    receiptFooter: text(1000),
    pointsPer100: z.number().finite().min(0).max(1000),
    pointValue: z.number().finite().min(0).max(100_000),
    refundNeedsApproval: z.boolean(),
    priceEditNeedsPermission: z.boolean(),
    epfEnabled: z.boolean(),
    etfEnabled: z.boolean(),
    epfEmployeePct: pct,
    epfEmployerPct: pct,
    etfPct: pct,
    epfIncludesAllowance: z.boolean(),
    workStart: hhmm,
    standardHours: z.number().finite().min(0).max(24),
    openingCash: z.number().finite().min(-100_000_000).max(100_000_000),
    incomeTaxPct: pct.nullish(),
    holidays: z.array(z.object({ date: ymd, name: text(200) })).max(1000),
    comboDiscount: rate.nullish(),
    guardianRate: rate.nullish(),
    // the PC's automatic folder backups (lib/localBackup.ts)
    localBackup: z.object({ times: z.array(hhmm).min(1).max(4), keepDays: count(3650) }).nullish(),
    kpis: z.array(z.object({ id, name, description: opt(text(500)), weight: z.number().finite().min(0).max(100), active: z.boolean() })).max(50).nullish(),
    attendanceWeight: z.number().finite().min(0).max(100).nullish(),
  })
  .partial()
  .loose();
