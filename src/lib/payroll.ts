import type { Attendance, Employee, PayLine, Settings } from "./types";

/**
 * Sri Lanka statutory contributions:
 *  - EPF: employee 8%, employer 12% (of basic, optionally + fixed allowances)
 *  - ETF: employer 3%
 * Both can be switched off globally (settings) or per employee.
 */
export function calcPayLine(e: Employee, s: Settings, otHours: number, deductions: number): PayLine {
  const otPay = Math.round(otHours * e.otRate);
  const gross = e.basic + e.allowance + otPay;
  const base = e.basic + (s.epfIncludesAllowance ? e.allowance : 0);
  const epfOn = s.epfEnabled && e.epf;
  const etfOn = s.etfEnabled && e.etf;
  const epfEmployee = epfOn ? Math.round((base * s.epfEmployeePct) / 100) : 0;
  const epfEmployer = epfOn ? Math.round((base * s.epfEmployerPct) / 100) : 0;
  const etfEmployer = etfOn ? Math.round((base * s.etfPct) / 100) : 0;
  return {
    employeeId: e.id,
    basic: e.basic,
    allowance: e.allowance,
    otHours,
    otPay,
    deductions,
    gross,
    epfEmployee,
    epfEmployer,
    etfEmployer,
    net: gross - epfEmployee - deductions,
    epf: epfOn,
    etf: etfOn,
  };
}

export function hoursWorked(a: Attendance, until = new Date()) {
  const end = a.clockOut ? new Date(a.clockOut) : until;
  return Math.max(0, (end.getTime() - new Date(a.clockIn).getTime()) / 3600000);
}

/** overtime hours for a month = sum of hours over the standard day */
export function otHoursFor(att: Attendance[], employeeId: string, month: string, standard: number) {
  return (
    Math.round(
      att
        .filter((a) => a.employeeId === employeeId && a.date.startsWith(month) && a.clockOut)
        .reduce((s, a) => s + Math.max(0, hoursWorked(a) - standard - 1), 0) * 2,
    ) / 2
  );
}
