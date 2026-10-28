import type { Addon, Booking, PartyPackage, Zone } from "./types";
import { timeToMin } from "./utils";

export const toHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function partyPrice(pkg: PartyPackage, mode: "room" | "full", guests: number, addonIds: string[], addons: Addon[]) {
  const base = mode === "full" ? pkg.priceFullVenue : pkg.priceRoomOnly;
  const extraGuests = Math.max(0, guests - pkg.guestLimit);
  const extra = extraGuests * pkg.extraGuestPrice;
  const lines = addonIds
    .map((id) => addons.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => ({ name: a!.name + (a!.perHead ? ` × ${guests}` : ""), amount: a!.perHead ? a!.price * guests : a!.price }));
  const total = base + extra + lines.reduce((s, l) => s + l.amount, 0);
  return { base, extraGuests, extra, lines, total, deposit: Math.round((total * pkg.depositPct) / 100) };
}

/** Returns a reason string if the requested slot can't be booked. */
export function bookingConflict(
  b: Pick<Booking, "kind" | "mode" | "date" | "start" | "end" | "kids" | "id">,
  bookings: Booking[],
  zones: Zone[],
): string | null {
  const s = timeToMin(b.start);
  const e = timeToMin(b.end);
  if (e <= s) return "End time must be after start time";
  const overlaps = (x: Booking) => x.id !== b.id && x.date === b.date && (x.status === "confirmed" || x.status === "pending") && s < timeToMin(x.end) && e > timeToMin(x.start);
  if (b.kind === "party") {
    const room = zones.find((z) => z.kind === "party");
    if (room && (s < timeToMin(room.openTime) || e > timeToMin(room.closeTime) + 30)) return `Party room is open ${room.openTime}–${room.closeTime}`;
    const clash = bookings.find((x) => x.kind === "party" && overlaps(x));
    if (clash) return `Party room already booked ${clash.start}–${clash.end} (${clash.ref})`;
    if (b.mode === "full") {
      const lockClash = bookings.find((x) => x.kind === "play" && overlaps(x));
      if (lockClash) return `A play reservation (${lockClash.ref}) overlaps — full-venue hire would lock it out`;
    }
  }
  if (b.kind === "play") {
    const lock = bookings.find((x) => x.kind === "party" && x.mode === "full" && overlaps({ ...x, start: toHHMM(timeToMin(x.start) - 30) }));
    if (lock) return `The play area is closed for an exclusive party ${lock.start}–${lock.end}`;
    const play = zones.find((z) => z.kind === "play");
    const reserved = bookings.filter((x) => x.kind === "play" && overlaps(x)).reduce((a, x) => a + x.kids, 0);
    // keep at least half of capacity for walk-ins
    if (play && reserved + b.kids > Math.floor(play.capacity / 2)) return "Online allocation for this time is full — please choose another slot";
  }
  return null;
}

// ---------------------------------------------------------------- the booking QR and overtime

/** What the booking QR holds: the reference, the date and the booked time — "PLAYROOM-BOOKING:BK-1005|2026-11-17|09:00-12:00". */
export const bookingQr = (b: Pick<Booking, "ref" | "date" | "start" | "end">) => `PLAYROOM-BOOKING:${b.ref}|${b.date}|${b.start}-${b.end}`;

/** The booking reference in a scanned QR (also older QRs that held just "BK-1005", or a reference typed in). */
export function refFromQr(text: string) {
  const t = text.trim();
  const body = t.toUpperCase().startsWith("PLAYROOM-BOOKING:") ? t.slice("PLAYROOM-BOOKING:".length) : t;
  return body.split("|")[0].trim().toUpperCase();
}

/** Overtime is charged in blocks of this many minutes: half an hour at half the hourly rate. */
export const OVERTIME_BLOCK_MIN = 30;

/**
 * Staying past the booked end: within the package's grace minutes it's free; after that every started
 * half hour (counted from the booked end) costs half the hourly overtime rate for the room or the whole venue.
 */
export function overtimeFor(b: Pick<Booking, "date" | "end" | "mode">, pkg: PartyPackage | undefined, at: Date) {
  const end = new Date(`${b.date}T${b.end}:00`);
  const minutes = Math.max(0, Math.floor((at.getTime() - end.getTime()) / 60000));
  const rate = (b.mode === "full" ? pkg?.overtimeFullPerHour : pkg?.overtimeRoomPerHour) ?? 0;
  const grace = pkg?.overtimeGraceMin ?? 10;
  const blocks = minutes > grace ? Math.ceil(minutes / OVERTIME_BLOCK_MIN) : 0;
  return { minutes, grace, rate, billedMinutes: blocks * OVERTIME_BLOCK_MIN, charge: Math.round((blocks * OVERTIME_BLOCK_MIN * rate) / 60) };
}
