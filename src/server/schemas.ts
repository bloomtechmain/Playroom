import { z } from "zod";

const id = z.string().min(1).max(100);
const money = z.number().finite().min(0).max(100_000_000);
const text = (max = 2000) => z.string().max(max);
const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "expected HH:mm");
const ymd = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "expected yyyy-MM-dd");

export const payMethod = z.enum(["cash", "card", "transfer", "digital", "wallet"]);

export const loginBody = z.object({ username: text(100), password: text(200) });
export const passwordBody = z.object({ current: text(200), next: text(200) });

export const recordBody = z.object({
  item: z.record(z.string(), z.unknown()).and(z.object({ id })),
  module: text(60),
  label: text(500),
  quiet: z.boolean().optional(),
});

export const folderBackupBody = z.object({ reason: text(200) });

export const settingsBody = z.object({ patch: z.record(z.string(), z.unknown()), detail: text(500).optional() });

export const checkInBody = z.object({
  customerId: id,
  childIds: z.array(id).max(20),
  adults: z.number().int().min(0).max(50),
  areas: z.array(z.object({ zoneId: id, visitors: z.number().int().min(0).max(500) })).min(1).max(2),
});

export const checkoutBody = z.object({
  method: payMethod,
  points: z.number().int().min(0).max(100_000_000).default(0),
  /** null = best automatic promotion, "" = none */
  promoId: z.string().max(100).nullable().optional(),
  manualDiscount: money.optional(),
});
export const cancelBody = z.object({ reason: text(500).min(1), refundMethod: payMethod.optional() });

export const saleBody = z.object({
  items: z.array(z.object({ productId: id, qty: z.number().int().min(1).max(10_000) })).min(1).max(200),
  discount: money,
  method: payMethod,
  tendered: money,
  customerId: id.optional(),
});

export const refundBody = z.object({
  refund: z.object({
    target: z.enum(["ticket", "sale", "booking"]),
    targetId: id,
    label: text(200),
    maxAmount: money,
    amount: money,
    full: z.boolean(),
    category: z.enum(["overcharge", "service", "left_early", "duplicate", "cancelled", "other"]).optional(),
    reason: text(1000),
    method: payMethod,
  }),
  /** "queue" = wait for a manager, "now" = approve with my own permission, "manager" = counter sign-off */
  approve: z.enum(["queue", "now", "manager"]).default("queue"),
  manager: z.object({ username: text(100), password: text(200) }).optional(),
});
export const decideBody = z.object({ approve: z.boolean() });

const bookingFields = {
  kind: z.enum(["play", "party", "cowork"]),
  mode: z.enum(["room", "full"]).optional(),
  customerId: id,
  date: ymd,
  start: hhmm,
  end: hhmm,
  zoneId: id,
  packageId: id.optional(),
  guests: z.number().int().min(0).max(1000),
  kids: z.number().int().min(0).max(1000),
  addonIds: z.array(id).max(50),
  theme: text(200),
  notes: text(),
  total: money,
  adjustment: z.number().finite().optional(),
  deposit: money,
  status: z.enum(["pending", "confirmed", "completed", "cancelled"]),
  source: z.enum(["walkin", "online", "phone"]),
};
export const bookingBody = z.object({ booking: z.object(bookingFields), payNow: money, method: z.union([payMethod, z.literal("online")]) });
export const payBookingBody = z.object({ amount: money, method: payMethod });
export const bookingVisitBody = z.object({ action: z.enum(["in", "out"]), waive: z.boolean().optional() });
export const bookingStatusBody = z.object({ status: z.enum(["pending", "confirmed", "completed", "cancelled"]) });

export const topUpBody = z.object({ amount: money.min(1), method: payMethod });
export const openShiftBody = z.object({ float: money });
export const closeShiftBody = z.object({ counted: money, notes: text() });

export const restoreBody = z.object({ snapshot: z.record(z.string(), z.unknown()), fileName: text(300) });

export const publicBookingBody = z.object({
  kind: z.enum(["play", "party"]),
  date: ymd,
  start: hhmm,
  packageId: id.optional(),
  mode: z.enum(["room", "full"]),
  guests: z.number().int().min(0).max(1000),
  kids: z.number().int().min(0).max(1000),
  hours: z.number().int().min(0).max(24),
  addonIds: z.array(id).max(50),
  theme: text(200),
  contact: z.object({ name: text(120), phone: text(30), email: text(200), child: text(120) }),
});

export const clockBody = z.object({ token: text(300), direction: z.enum(["in", "out"]).optional() });

export const staffBody = z.object({
  employee: z.record(z.string(), z.unknown()).and(z.object({ id, name: text(120) })),
  login: z.object({ username: text(60), roleId: id, email: text(200) }).optional(),
});
