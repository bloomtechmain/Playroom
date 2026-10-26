import type { Attendance, Employee, PayItem, PayLine, Settings } from "./types";

const sum = (items: PayItem[]) => items.reduce((a, x) => a + x.amount, 0);

/** Drops blank rows and keeps amounts whole, non-negative rupees. */
export const cleanItems = (items: PayItem[]) =>
  items.map((x) => ({ ...x, name: x.name.trim(), amount: Math.max(0, Math.round(Number(x.amount) || 0)) })).filter((x) => x.name && x.amount > 0);

/** A pay line's allowances — older runs only stored the total. */
export const lineAllowances = (l: PayLine): PayItem[] => l.allowances ?? (l.allowance ? [{ name: "Fixed allowance", amount: l.allowance }] : []);
/** A pay line's deductions other than EPF — older runs only stored the total. */
export const lineDeductions = (l: PayLine): PayItem[] => l.deductionItems ?? (l.deductions ? [{ name: "Advances / no-pay", amount: l.deductions }] : []);

/**
 * Sri Lanka statutory contributions:
 *  - EPF: employee 8%, employer 12% of basic plus the allowances marked for EPF
 *  - ETF: employer 3% of the same base
 * Both can be switched off globally (settings) or per employee.
 * Allowances and deductions come from the employee's record unless this month's are given.
 */
export function calcPayLine(e: Employee, s: Settings, otHours: number, month: { allowances?: PayItem[]; deductions?: PayItem[] } = {}): PayLine {
  const allowances = cleanItems(month.allowances ?? e.allowances ?? []);
  const deductionItems = cleanItems(month.deductions ?? e.deductions ?? []);
  const allowance = sum(allowances);
  const otPay = Math.round(otHours * e.otRate);
  const gross = e.basic + allowance + otPay;
  const base = e.basic + sum(allowances.filter((a) => a.epf));
  const epfOn = s.epfEnabled && e.epf;
  const etfOn = s.etfEnabled && e.etf;
  const epfEmployee = epfOn ? Math.round((base * s.epfEmployeePct) / 100) : 0;
  const epfEmployer = epfOn ? Math.round((base * s.epfEmployerPct) / 100) : 0;
  const etfEmployer = etfOn ? Math.round((base * s.etfPct) / 100) : 0;
  const deductions = sum(deductionItems);
  return {
    employeeId: e.id,
    basic: e.basic,
    allowance,
    allowances,
    otHours,
    otPay,
    deductions,
    deductionItems,
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
