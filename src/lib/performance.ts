import { hoursWorked } from "./payroll";
import type { Attendance, Evaluation, Kpi, Settings, Training } from "./types";

/**
 * Staff performance: KPI marks (0–10) given each month, plus an attendance score worked out from arrivals
 * (the share of clock-ins on time or early, against the employee's working hours), combined by weight.
 */

export const SUGGESTED_KPIS: Omit<Kpi, "id">[] = [
  { name: "Customer service", description: "Friendly, patient and helpful with parents and children", weight: 2, active: true },
  { name: "Safety & cleanliness", description: "Keeps play areas safe and tidy, follows the rules", weight: 2, active: true },
  { name: "Teamwork", description: "Supports colleagues and shares the load", weight: 1, active: true },
  { name: "Initiative", description: "Spots what needs doing and does it without being asked", weight: 1, active: true },
  { name: "Product & procedure knowledge", description: "Knows prices, packages, the till and the booking rules", weight: 1, active: true },
];

export const activeKpis = (s: Settings) => (s.kpis ?? []).filter((k) => k.active);
export const attendanceWeight = (s: Settings) => s.attendanceWeight ?? 1;
export const evaluationId = (employeeId: string, period: string) => `ev-${employeeId}-${period}`;

/** red below 5, amber 5–6.9, blue 7–8.9, green 9 and up */
export const scoreTone = (n: number) => (n >= 9 ? "mint" : n >= 7 ? "sky" : n >= 5 ? "sun" : "rose");
export const fmtScore = (n: number | undefined) => (n === undefined ? "—" : n.toFixed(1).replace(/\.0$/, ""));

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const inRange = (month: string, from: string, to: string) => month >= from && month <= to;

export interface AttendanceStats {
  days: number;
  hours: number;
  onTime: number;
  early: number;
  late: number;
  offDay: number;
  lateMinutes: number;
  /** 0–10: clock-ins on time or early ÷ clock-ins measured against working hours; absent when none were measured */
  score?: number;
}

export function attendanceStats(att: Attendance[], employeeId: string, from: string, to: string): AttendanceStats {
  const rows = att.filter((a) => a.employeeId === employeeId && inRange(a.date.slice(0, 7), from, to));
  const n = (p: Attendance["punctuality"]) => rows.filter((a) => a.punctuality === p).length;
  const onTime = n("on_time");
  const early = n("early");
  const late = n("late");
  const measured = onTime + early + late;
  return {
    days: new Set(rows.map((a) => a.date)).size,
    hours: rows.filter((a) => a.clockOut).reduce((s, a) => s + hoursWorked(a), 0),
    onTime,
    early,
    late,
    offDay: n("off_day"),
    lateMinutes: rows.filter((a) => a.punctuality === "late").reduce((s, a) => s + (a.inDiffMin ?? 0), 0),
    score: measured ? (10 * (onTime + early)) / measured : undefined,
  };
}

export interface Performance {
  /** KPI id → average mark over the months scored */
  kpi: Record<string, number | undefined>;
  /** months with an evaluation */
  months: number;
  attendance: AttendanceStats;
  /** weighted average of the KPI averages and the attendance score */
  overall?: number;
  trainings: Training[];
  trainingHours: number;
}

/** One employee over a range of months ("yyyy-MM", inclusive). */
export function performanceOf(
  employeeId: string,
  data: { evaluations: Evaluation[]; attendance: Attendance[]; trainings: Training[]; settings: Settings },
  from: string,
  to: string,
): Performance {
  const evs = data.evaluations.filter((e) => e.employeeId === employeeId && inRange(e.period, from, to));
  const kpis = activeKpis(data.settings);
  const kpi = Object.fromEntries(kpis.map((k) => [k.id, avg(evs.map((e) => e.scores[k.id]).filter((x): x is number => typeof x === "number"))]));
  const attendance = attendanceStats(data.attendance, employeeId, from, to);
  const parts: [number, number][] = kpis.filter((k) => kpi[k.id] !== undefined && k.weight > 0).map((k) => [kpi[k.id]!, k.weight]);
  if (attendance.score !== undefined && attendanceWeight(data.settings) > 0) parts.push([attendance.score, attendanceWeight(data.settings)]);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const trainings = data.trainings.filter((t) => t.employeeIds.includes(employeeId) && inRange(t.date.slice(0, 7), from, to));
  return {
    kpi,
    months: evs.length,
    attendance,
    overall: w ? parts.reduce((a, [v, x]) => a + v * x, 0) / w : undefined,
    trainings,
    trainingHours: trainings.reduce((a, t) => a + t.hours, 0),
  };
}

/** Average of an evaluation's marks for the active KPIs (for a quick one-month figure). */
export function evaluationAverage(ev: Evaluation | undefined, s: Settings) {
  if (!ev) return undefined;
  return avg(activeKpis(s).map((k) => ev.scores[k.id]).filter((x): x is number => typeof x === "number"));
}
