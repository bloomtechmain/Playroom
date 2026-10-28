import type { Attendance, Punctuality, WorkHours } from "./types";

/** Arrivals against each employee's working hours (Staff → Working hours). Shared by the server (at clock-in) and the screens. */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, as staff rosters are read */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export const DEFAULT_HOURS: WorkHours = { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5, 6], graceMin: 5 };

type Arrival = Pick<Attendance, "scheduledIn" | "inDiffMin" | "punctuality">;

/** How a clock-in compares with the hours: within the grace minutes either side is on time. No hours set → nothing. */
export function arrivalOf(hours: WorkHours | undefined, clockIn: string): Arrival {
  if (!hours) return {};
  const at = new Date(clockIn);
  if (!hours.days.includes(at.getDay())) return { punctuality: "off_day" };
  const [h, m] = hours.start.split(":").map(Number);
  const start = new Date(at);
  start.setHours(h, m, 0, 0);
  const diff = Math.round((at.getTime() - start.getTime()) / 60000);
  return { scheduledIn: hours.start, inDiffMin: diff, punctuality: diff > hours.graceMin ? "late" : diff < -hours.graceMin ? "early" : "on_time" };
}

export const PUNCTUALITY: Record<Punctuality, { label: string; tone: "sky" | "mint" | "rose" | "lilac" }> = {
  early: { label: "Early", tone: "sky" },
  on_time: { label: "On time", tone: "mint" },
  late: { label: "Late", tone: "rose" },
  off_day: { label: "Day off", tone: "lilac" },
};

const mins = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`);

/** "Late 12m", "Early 1h 5m", "On time", "Day off" */
export function arrivalLabel(a: Attendance) {
  if (!a.punctuality) return "";
  const d = a.inDiffMin ?? 0;
  if (a.punctuality === "late") return `Late ${mins(d)}`;
  if (a.punctuality === "early") return `Early ${mins(-d)}`;
  return PUNCTUALITY[a.punctuality].label;
}

/** "Mon–Sat", "Every day", "Mon, Wed, Fri" */
export function daysLabel(days: number[]) {
  const set = WEEK.filter((d) => days.includes(d));
  if (set.length === 7) return "Every day";
  if (!set.length) return "No days";
  const idx = set.map((d) => WEEK.indexOf(d));
  const run = idx.every((x, i) => i === 0 || x === idx[i - 1] + 1);
  return run && set.length > 2 ? `${DAY_NAMES[set[0]]}–${DAY_NAMES[set[set.length - 1]]}` : set.map((d) => DAY_NAMES[d]).join(", ");
}

export const hoursLabel = (h: WorkHours) => `${h.start}–${h.end} · ${daysLabel(h.days)}`;
