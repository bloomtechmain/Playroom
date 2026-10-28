"use client";

import { useState } from "react";
import { format, subMonths } from "date-fns";
import { useStore } from "@/lib/store";
import { hoursWorked } from "@/lib/payroll";
import { arrivalLabel, DAY_NAMES, DEFAULT_HOURS, hoursLabel, PUNCTUALITY, WEEK } from "@/lib/punctuality";
import type { Attendance, Employee, Punctuality, WorkHours } from "@/lib/types";
import { cx, fmtDate, fmtTime } from "@/lib/utils";
import { Badge, Button, Field, Input, Modal, Select, Stat, Table, Toggle, toneCls } from "./ui";

/** Early (blue) · On time (green) · Late (red) · Day off (purple). Only rendered for roles with "hr.hours". */
export function ArrivalBadge({ a }: { a: Attendance }) {
  if (!a.punctuality) return <span className="text-xs text-muted">—</span>;
  return <Badge tone={PUNCTUALITY[a.punctuality].tone}>{arrivalLabel(a)}</Badge>;
}

/** Text colour for a clock-in time. */
export const arrivalText = (a: Attendance) => (a.punctuality ? toneCls[PUNCTUALITY[a.punctuality].tone].text : "");

export function WorkHoursEditor({ value, onChange }: { value?: WorkHours; onChange: (v: WorkHours | undefined) => void }) {
  const h = value ?? DEFAULT_HOURS;
  const set = (p: Partial<WorkHours>) => onChange({ ...h, ...p });
  const toggleDay = (d: number) => set({ days: h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d].sort() });
  return (
    <div>
      <Toggle checked={!!value} onChange={(on) => onChange(on ? h : undefined)} label="Track arrivals against set working hours" />
      {value && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starts at"><Input type="time" value={h.start} onChange={(e) => set({ start: e.target.value })} /></Field>
            <Field label="Ends at"><Input type="time" value={h.end} onChange={(e) => set({ end: e.target.value })} /></Field>
            <Field label="Grace (minutes)" hint="Within this either side = on time">
              <Input type="number" min={0} max={240} value={h.graceMin} onChange={(e) => set({ graceMin: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })} />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-bold text-ink/80">Working days</div>
            <div className="flex flex-wrap gap-1.5">
              {WEEK.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cx("h-9 w-12 rounded-xl border text-sm font-bold transition", h.days.includes(d) ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:bg-[#f6f2eb]")}
                >
                  {DAY_NAMES[d]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">
            Each clock-in is marked <Badge tone="sky">Early</Badge> <Badge tone="mint">On time</Badge> <Badge tone="rose">Late</Badge> or <Badge tone="lilac">Day off</Badge> against these hours
            when it happens. Only administrators and the owner see this.
          </p>
        </div>
      )}
    </div>
  );
}

/** One employee's attendance, month by month, with every arrival marked. */
export function AttendanceRecord({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const attendance = useStore((s) => s.attendance);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const rows = attendance.filter((a) => a.employeeId === employee.id && a.date.startsWith(month)).sort((a, b) => b.clockIn.localeCompare(a.clockIn));
  const count = (p: Punctuality) => rows.filter((a) => a.punctuality === p).length;
  const lateMins = rows.filter((a) => a.punctuality === "late").reduce((s, a) => s + (a.inDiffMin ?? 0), 0);
  return (
    <Modal open onClose={onClose} title={`${employee.name} — attendance record`} width="max-w-3xl" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">{employee.workHours ? <>Working hours: <b className="text-ink">{hoursLabel(employee.workHours)}</b> · grace {employee.workHours.graceMin} min</> : "No working hours set — arrivals aren't marked."}</div>
        <Select className="w-48" value={month} onChange={(e) => setMonth(e.target.value)}>
          {[0, 1, 2, 3, 4, 5].map((m) => {
            const v = format(subMonths(new Date(), m), "yyyy-MM");
            return <option key={v} value={v}>{format(new Date(v + "-01"), "MMMM yyyy")}</option>;
          })}
        </Select>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On time" value={count("on_time")} tone="mint" />
        <Stat label="Early" value={count("early")} tone="sky" />
        <Stat label="Late" value={count("late")} sub={lateMins ? `${lateMins} min in total` : undefined} tone="rose" />
        <Stat label="Days present" value={rows.length} sub={count("off_day") ? `${count("off_day")} on days off` : undefined} tone="lilac" />
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
        <Table head={["Date", "Clock in", "Arrival", "Clock out", "Hours", "Method"]}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="tabular">{fmtDate(a.date, "EEE dd MMM")}</td>
              <td className={cx("font-bold tabular", arrivalText(a))}>{fmtTime(a.clockIn)}{a.scheduledIn && <span className="ml-1 text-[11px] font-normal text-muted">/ {a.scheduledIn}</span>}</td>
              <td><ArrivalBadge a={a} /></td>
              <td className="tabular">{a.clockOut ? fmtTime(a.clockOut) : <Badge tone="mint">On site</Badge>}</td>
              <td className="tabular">{hoursWorked(a).toFixed(1)}</td>
              <td>{a.method === "qr" ? <Badge tone="sky">QR scan</Badge> : <Badge tone="sun">Manual</Badge>}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-muted">No attendance this month.</td>
            </tr>
          )}
        </Table>
      </div>
    </Modal>
  );
}
