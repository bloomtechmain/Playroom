import type { Settings } from "./types";

/** WhatsApp messaging settings (stored inside the business settings document). */
export interface WhatsAppSettings {
  /** country calling code used for local numbers like 07X XXX XXXX */
  countryCode: string;
  sendCheckIn: boolean;
  sendReceipt: boolean;
  birthdayAuto: boolean;
  /** HH:mm — when the automatic birthday wishes go out */
  birthdayTime: string;
  checkInTemplate: string;
  birthdayTemplate: string;
  /** added under every promotion: how to stop receiving them */
  promoFooter: string;
  /** seconds to wait between bulk messages (random in this range) — sending fast gets numbers banned */
  minDelay: number;
  maxDelay: number;
  /** most promotions + birthday wishes sent per day */
  dailyLimit: number;
}

export const WHATSAPP_DEFAULTS: WhatsAppSettings = {
  countryCode: "94",
  sendCheckIn: true,
  sendReceipt: true,
  birthdayAuto: false,
  birthdayTime: "09:00",
  checkInTemplate: "Hi {name}, welcome to {business}! {kids} checked in at {time}. Show this QR at the exit — you pay for the time you stay. 🎈",
  birthdayTemplate: "🎉 Happy birthday {child}! Everyone at {business} wishes you a wonderful {age}th birthday. Come and celebrate with us — there's a little treat waiting for you! 🎂",
  promoFooter: "Reply STOP to stop receiving offers.",
  minDelay: 8,
  maxDelay: 20,
  dailyLimit: 200,
};

export const whatsappSettings = (s: Pick<Settings, "whatsapp">): WhatsAppSettings => ({ ...WHATSAPP_DEFAULTS, ...(s.whatsapp ?? {}) });

/** Fill {placeholders}; unknown ones are left as they are. */
export const renderTemplate = (tpl: string, vars: Record<string, string | number | undefined>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k])));

/** "077 123 4567" → "94771234567" (digits only, with country code), or null if it can't be a mobile number. */
export function normalizePhone(phone: string | undefined, countryCode: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = countryCode + n.slice(1);
  else if (!n.startsWith(countryCode) && n.length <= 10) n = countryCode + n;
  return n.length >= 10 && n.length <= 15 ? n : null;
}

export const PLACEHOLDERS = {
  checkIn: ["{name}", "{business}", "{kids}", "{time}", "{code}"],
  birthday: ["{child}", "{name}", "{age}", "{business}"],
  promotion: ["{name}", "{business}", "{code}", "{promo}"],
};

export type WaMessageKind = "checkin" | "receipt" | "birthday" | "promotion" | "manual";
export type WaMessageStatus = "queued" | "sending" | "sent" | "failed" | "cancelled";

export interface WaMessage {
  id: string;
  createdAt: string;
  kind: WaMessageKind;
  customerId?: string;
  customerName?: string;
  childId?: string;
  toPhone: string;
  body: string;
  campaign?: string;
  status: WaMessageStatus;
  error?: string;
  attempts: number;
  sentAt?: string;
}

export interface WaStatus {
  status: "disconnected" | "connecting" | "qr" | "connected";
  qr?: string;
  me?: { id: string; name?: string };
  error?: string;
  queue: { queued: number; sentToday: number; failedToday: number; marketingToday: number };
}

/** Who a bulk promotion goes to. */
export interface Audience {
  segment: "all" | "members" | "recent" | "kids_age" | "birthday_month";
  /** recent: visited within this many days */
  days?: number;
  minAge?: number;
  maxAge?: number;
}

/** A child with a birthday coming up (WhatsApp → Birthdays). */
export interface UpcomingBirthday {
  childId: string;
  child: string;
  dob: string;
  date: string;
  age: number;
  inDays: number;
  customerId: string;
  guardian: string;
  phone: string;
  optOut: boolean;
  /** queued | sent this year */
  wished?: string;
}
