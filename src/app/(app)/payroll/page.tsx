"use client";

import { useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { Calculator, Download, FileText, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { attendanceUnits, basicLabel, calcPayLine, cleanItems, EMPLOYMENT, employmentOf, hoursWorked, lineAllowances, lineDeductions, otHoursFor, payBasisOf, unitsLabel } from "@/lib/payroll";
import { hoursLabel } from "@/lib/punctuality";
import { ArrivalBadge, arrivalText } from "@/components/Arrival";
import { PayItemsEditor } from "@/components/PayItems";
import type { Employee, PayItem, PayLine, PayrollRun } from "@/lib/types";
import { cx, fmtDate, fmtTime, money, uid } from "@/lib/utils";
import { useNewReport } from "@/lib/useNewReport";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Stat, Table, Toggle, toast } from "@/components/ui";

export default function PayrollPage() {
  const can = useCan();
  if (!can("payroll.view")) return <NoAccess what="payroll" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const employees = useStore((s) => s.employees);
  const attendance = useStore((s) => s.attendance);
  const runs = useStore((s) => s.payroll);
  const save = useStore((s) => s.save);
  const payPayroll = useStore((s) => s.payPayroll);
  const me = useStore((s) => s.currentUserId);
  const months = useMemo(() => [-2, -1, 0].map((m) => format(addMonths(new Date(), m), "yyyy-MM")), []);
  const [month, setMonth] = useState(format(subMonths(new Date(), 0), "yyyy-MM"));
  const [slip, setSlip] = useState<{ run: PayrollRun; line: PayLine } | null>(null);
  const [adjust, setAdjust] = useState<PayLine | null>(null);
  const [review, setReview] = useState<PayLine | null>(null);
  const run = runs.find((r) => r.month === month);
  const editable = can("payroll.run") && run?.status === "draft";

  const prepare = () => {
    // day- and hour-paid staff start from what attendance shows; the administrator checks it before paying
    const lines = employees
      .filter((e) => e.active)
      .map((e) => {
        const basis = payBasisOf(e);
        const ot = basis === "hourly" ? 0 : otHoursFor(attendance, e.id, month, settings.standardHours);
        return calcPayLine(e, settings, ot, { units: basis === "monthly" ? undefined : attendanceUnits(attendance, e, month) });
      });
    const r: PayrollRun = { id: uid("pay-"), month, status: "draft", lines, createdAt: new Date().toISOString(), createdBy: me ?? "" };
    save("payroll", r, "Payroll", `Prepared payroll ${month}`);
    toast("Draft payroll prepared from attendance");
  };

  const updateLine = (empId: string, patch: { otHours?: number; epf?: boolean; etf?: boolean; allowances?: PayItem[]; deductions?: PayItem[]; units?: number; basic?: number }) => {
    if (!run) return;
    const lines = run.lines.map((l) => {
      if (l.employeeId !== empId) return l;
      const e = employees.find((x) => x.id === empId)!;
      const epf = patch.epf ?? l.epf;
      const etf = patch.etf ?? l.etf;
      // this month's items (kept as adjusted), not the employee's current ones
      return calcPayLine({ ...e, epf, etf, rate: l.rate ?? e.rate }, settings, patch.otHours ?? l.otHours, {
        allowances: patch.allowances ?? lineAllowances(l),
        deductions: patch.deductions ?? lineDeductions(l),
        ...kept(l, patch),
      });
    });
    save("payroll", { ...run, lines }, "Payroll", `Edited ${month}`, { quiet: true });
  };

  const recalc = () => {
    if (!run) return;
    const lines = run.lines.map((l) => {
      const e = employees.find((x) => x.id === l.employeeId)!;
      return calcPayLine({ ...e, epf: l.epf, etf: l.etf, rate: l.rate ?? e.rate }, settings, l.otHours, { allowances: lineAllowances(l), deductions: lineDeductions(l), ...kept(l) });
    });
    save("payroll", { ...run, lines }, "Payroll", `Recalculated ${month}`);
    toast("Recalculated with current EPF/ETF settings");
  };

  const pay = async () => {
    if (!run) return;
    // marks the run paid and posts salaries + employer EPF/ETF to expenses in one go
    if (await payPayroll(run.id)) toast("Payroll paid and posted to expenses");
  };


  const newReport = useNewReport();
  const payrollPdf = async () => {
    if (!run || !t) return;
    const p = await newReport("Payroll sheet", `${format(new Date(run.month + "-01"), "MMMM yyyy")} — ${run.status === "paid" ? `paid ${run.paidAt ? fmtDate(run.paidAt) : ""}` : "draft"}`, { landscape: true });
    p.kpis([
      { label: "Gross pay", value: money(t.gross) },
      { label: "Net to employees", value: money(t.net) },
      { label: `EPF remittance (${settings.epfEmployeePct}% + ${settings.epfEmployerPct}%)`, value: money(t.epfEe + t.epfEr) },
      { label: `ETF remittance (${settings.etfPct}%)`, value: money(t.etf) },
      { label: "Total cost to business", value: money(t.gross + t.epfEr + t.etf) },
    ]);
    p.table(
      ["Employee", "Code", "EPF no.", "Basic / wages", "Allowance", "OT hrs", "OT pay", "Deductions", "Gross", `EPF ${settings.epfEmployeePct}%`, "Net pay", `EPF ${settings.epfEmployerPct}%`, `ETF ${settings.etfPct}%`],
      run.lines.map((l) => {
        const e = employees.find((x) => x.id === l.employeeId);
        return [unitsLabel(l) ? `${e?.name ?? ""} (${unitsLabel(l)})` : (e?.name ?? ""), e?.code ?? "", e?.epfNo || "-", l.basic, l.allowance, String(l.otHours || "-"), l.otPay, l.deductions, l.gross, l.epfEmployee, l.net, l.epfEmployer, l.etfEmployer];
      }),
      {
        align: ["l", "l", "l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r"],
        foot: ["Total", "", "", run.lines.reduce((a, l) => a + l.basic, 0), run.lines.reduce((a, l) => a + l.allowance, 0), "", t.ot, t.ded, t.gross, t.epfEe, t.net, t.epfEr, t.etf],
      },
    );
    p.paragraph(`EPF/ETF are calculated on basic salary plus the allowances marked for EPF/ETF; overtime is excluded. EPF C-Form total ${money(t.epfEe + t.epfEr)}; ETF R4 return total ${money(t.etf)}.`);
    p.signatures(["Prepared by", "Approved by", "Paid by"]);
    p.save(`payroll-sheet_${run.month}`);
  };

  const t = run?.lines.reduce(
    (a, l) => ({ gross: a.gross + l.gross, net: a.net + l.net, epfEe: a.epfEe + l.epfEmployee, epfEr: a.epfEr + l.epfEmployer, etf: a.etf + l.etfEmployer, ot: a.ot + l.otPay, ded: a.ded + l.deductions }),
    { gross: 0, net: 0, epfEe: 0, epfEr: 0, etf: 0, ot: 0, ded: 0 },
  );

  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly salaries with Sri Lanka EPF (8% + 12%) and ETF (3%). Paid runs post straight into expenses." />

      <Card title="Statutory contributions" className="mb-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.2fr]">
          <div className="space-y-3">
            <Toggle disabled={!can("payroll.run")} checked={settings.epfEnabled} onChange={(v) => setSettings({ epfEnabled: v }, `EPF ${v ? "enabled" : "disabled"}`)} label={<b>EPF — Employees&apos; Provident Fund</b>} />
            <div className="grid grid-cols-2 gap-2 pl-14">
              <Field label="Employee %"><Input disabled={!can("payroll.run") || !settings.epfEnabled} type="number" value={settings.epfEmployeePct} onChange={(e) => setSettings({ epfEmployeePct: Number(e.target.value) })} /></Field>
              <Field label="Employer %"><Input disabled={!can("payroll.run") || !settings.epfEnabled} type="number" value={settings.epfEmployerPct} onChange={(e) => setSettings({ epfEmployerPct: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <div className="space-y-3">
            <Toggle disabled={!can("payroll.run")} checked={settings.etfEnabled} onChange={(v) => setSettings({ etfEnabled: v }, `ETF ${v ? "enabled" : "disabled"}`)} label={<b>ETF — Employees&apos; Trust Fund</b>} />
            <div className="pl-14"><Field label="Employer %"><Input disabled={!can("payroll.run") || !settings.etfEnabled} type="number" value={settings.etfPct} onChange={(e) => setSettings({ etfPct: Number(e.target.value) })} /></Field></div>
          </div>
          <div className="space-y-2 rounded-xl bg-[#faf7f1] p-4 text-sm">
            <p className="font-bold">What EPF/ETF are calculated on</p>
            <p className="text-xs text-muted">Basic salary plus the allowances ticked &ldquo;EPF/ETF&rdquo; on each employee (Staff page) or on the month&apos;s payroll. Overtime is excluded. Each employee can also be opted out individually (e.g. part-time staff).</p>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select className="w-52" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{format(new Date(m + "-01"), "MMMM yyyy")}</option>)}
        </Select>
        {run ? <Badge tone={run.status === "paid" ? "mint" : "sun"}>{run.status === "paid" ? `Paid ${run.paidAt && fmtDate(run.paidAt)}` : "Draft"}</Badge> : <Badge tone="gray">Not prepared</Badge>}
        <div className="flex-1" />
        {!run && can("payroll.run") && <Button onClick={prepare}>Prepare payroll</Button>}
        {run && <Button variant="secondary" icon={<Download size={15} />} onClick={() => payrollPdf().catch(() => toast("Couldn't create the PDF", "err"))}>Payroll sheet PDF</Button>}
        {editable && (
          <>
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={recalc}>Recalculate</Button>
            <Button variant="success" onClick={pay}>Approve & pay {t && money(t.net)}</Button>
          </>
        )}
      </div>

      {run && t && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Gross pay" value={money(t.gross)} sub={`incl. OT ${money(t.ot)}`} tone="sky" />
            <Stat label="Net to employees" value={money(t.net)} tone="mint" />
            <Stat label={`EPF remittance (${settings.epfEmployeePct}% + ${settings.epfEmployerPct}%)`} value={money(t.epfEe + t.epfEr)} sub="C-Form total" tone="lilac" />
            <Stat label={`ETF remittance (${settings.etfPct}%)`} value={money(t.etf)} sub="R4 return total" tone="sun" />
            <Stat label="Total cost to business" value={money(t.gross + t.epfEr + t.etf)} tone="rose" />
          </div>
          <Card pad={false}>
            <Table head={["Employee", "Basic / wages", "Allowance", "OT hrs", "OT pay", "Deductions", "Gross", `EPF ${settings.epfEmployeePct}%`, "Net pay", `EPF ${settings.epfEmployerPct}%`, `ETF ${settings.etfPct}%`, "EPF / ETF", ""]}>
              {run.lines.map((l) => {
                const e = employees.find((x) => x.id === l.employeeId)!;
                return (
                  <tr key={l.employeeId}>
                    <td>
                      <div className="font-bold">{e.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">{e.designation}{employmentOf(e) !== "permanent" && <Badge tone={EMPLOYMENT[employmentOf(e)].tone}>{EMPLOYMENT[employmentOf(e)].label}</Badge>}</div>
                    </td>
                    <td className="tabular">
                      {money(l.basic, false)}
                      {unitsLabel(l) && <div className="text-[11px] text-muted">{unitsLabel(l)}</div>}
                      {editable && l.payBasis && l.payBasis !== "monthly" && (
                        <button onClick={() => setReview(l)} className={cx("mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold", l.basic ? "bg-sky-soft text-navy" : "bg-rose-soft text-[#c24f69]")}>
                          <Calculator size={11} /> {l.basic ? "Review" : "Set pay"}
                        </button>
                      )}
                    </td>
                    <td className="tabular">{money(l.allowance, false)}{lineAllowances(l).length > 1 && <div className="text-[11px] text-muted">{lineAllowances(l).length} items</div>}</td>
                    <td>{editable ? <Input className="h-8 w-16" type="number" value={l.otHours} onChange={(ev) => updateLine(l.employeeId, { otHours: Number(ev.target.value) })} /> : <span className="tabular">{l.otHours}</span>}</td>
                    <td className="tabular">{money(l.otPay, false)}</td>
                    <td className="tabular">{l.deductions ? `-${money(l.deductions, false)}` : "—"}{lineDeductions(l).length > 1 && <div className="text-[11px] text-muted">{lineDeductions(l).length} items</div>}</td>
                    <td className="tabular font-bold">{money(l.gross, false)}</td>
                    <td className="tabular text-[#c24f69]">{l.epfEmployee ? `-${money(l.epfEmployee, false)}` : "—"}</td>
                    <td className="tabular font-bold text-[#2f8f72]">{money(l.net, false)}</td>
                    <td className="tabular text-muted">{l.epfEmployer ? money(l.epfEmployer, false) : "—"}</td>
                    <td className="tabular text-muted">{l.etfEmployer ? money(l.etfEmployer, false) : "—"}</td>
                    <td>
                      {editable ? (
                        <div className="flex gap-2">
                          <MiniToggle on={l.epf} label="EPF" onClick={() => updateLine(l.employeeId, { epf: !l.epf })} disabled={!settings.epfEnabled} />
                          <MiniToggle on={l.etf} label="ETF" onClick={() => updateLine(l.employeeId, { etf: !l.etf })} disabled={!settings.etfEnabled} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted">{[l.epf && "EPF", l.etf && "ETF"].filter(Boolean).join(" · ") || "Opted out"}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {editable && <button title="Adjust allowances & deductions for this month" onClick={() => setAdjust(l)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><SlidersHorizontal size={15} /></button>}
                        <button title="Payslip" onClick={() => setSlip({ run, line: l })} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><FileText size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[#faf7f1] font-bold">
                <td>Total</td>
                <td colSpan={3} />
                <td className="tabular">{money(t.ot, false)}</td>
                <td className="tabular">{money(t.ded, false)}</td>
                <td className="tabular">{money(t.gross, false)}</td>
                <td className="tabular">{money(t.epfEe, false)}</td>
                <td className="tabular">{money(t.net, false)}</td>
                <td className="tabular">{money(t.epfEr, false)}</td>
                <td className="tabular">{money(t.etf, false)}</td>
                <td colSpan={2} />
              </tr>
            </Table>
          </Card>
          {run.status === "draft" && <p className="mt-3 text-xs text-muted">OT hours are pulled from QR attendance (hours beyond {settings.standardHours}h + 1h break per day). Non-permanent staff start from the days they clocked in and part-time staff from the hours between clock-in and clock-out — use <b>Review</b> to check their attendance and set what they are paid.</p>}
        </>
      )}
      {!run && (
        <Card><p className="py-8 text-center text-sm text-muted">No payroll for {format(new Date(month + "-01"), "MMMM yyyy")} yet.{can("payroll.run") && " Prepare it to pull in salaries and overtime from attendance."}</p></Card>
      )}
      {review && run && (
        <ReviewPay
          month={month}
          line={run.lines.find((l) => l.employeeId === review.employeeId) ?? review}
          employee={employees.find((x) => x.id === review.employeeId)!}
          onClose={() => setReview(null)}
          onSave={(units, basic) => {
            updateLine(review.employeeId, { units, basic });
            setReview(null);
            toast("Pay set for this month");
          }}
        />
      )}
      {slip && <Payslip run={slip.run} line={slip.line} onClose={() => setSlip(null)} />}
      {adjust && run && (
        <AdjustLine
          month={month}
          line={adjust}
          employee={employees.find((x) => x.id === adjust.employeeId)!}
          onClose={() => setAdjust(null)}
          onSave={(allowances, deductions) => {
            updateLine(adjust.employeeId, { allowances, deductions });
            setAdjust(null);
            toast("Pay updated for this month");
          }}
        />
      )}
    </>
  );
}

/**
 * Days / hours and amount to carry into a recalculation. Monthly salaries follow the Staff record; for day- and
 * hour-paid lines the days or hours stay, and so does an amount the administrator typed — unless the days or
 * hours themselves change (then it's days × rate again).
 */
function kept(l: PayLine, patch: { units?: number; basic?: number } = {}) {
  if (!l.payBasis || l.payBasis === "monthly") return {};
  if ("basic" in patch) return { units: patch.units ?? l.units, basic: patch.basic };
  if (patch.units !== undefined) return { units: patch.units };
  return { units: l.units, basic: l.basic };
}

/** A day- or hour-paid employee's month: their attendance (and arrivals for administrators) next to what they're paid. */
function ReviewPay({ month, line, employee, onClose, onSave }: { month: string; line: PayLine; employee: Employee; onClose: () => void; onSave: (units: number, basic: number | undefined) => void }) {
  const attendance = useStore((s) => s.attendance);
  const daily = line.payBasis === "daily";
  const rate = line.rate ?? employee.rate ?? 0;
  const rows = attendance.filter((a) => a.employeeId === employee.id && a.date.startsWith(month)).sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  const fromAttendance = attendanceUnits(attendance, employee, month);
  const [units, setUnits] = useState(String(line.units ?? 0));
  // an amount typed by hand; null = days / hours × rate
  const [amount, setAmount] = useState<string | null>(() => (Math.round((line.units ?? 0) * rate) !== line.basic ? String(line.basic) : null));
  const n = Math.max(0, Number(units) || 0);
  const calculated = Math.round(n * rate);
  const pay = amount === null ? calculated : Math.max(0, Math.round(Number(amount) || 0));
  const unit = daily ? "days" : "hours";
  const open = rows.filter((a) => !a.clockOut).length;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${employee.name} — ${format(new Date(month + "-01"), "MMMM yyyy")}`}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(n, amount === null ? undefined : pay)}>Save pay {money(pay)}</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Badge tone={EMPLOYMENT[employmentOf(employee)].tone}>{EMPLOYMENT[employmentOf(employee)].label}</Badge>
        <span>Paid <b>{money(rate)}</b> per {daily ? "day" : "hour"}</span>
        {employee.workHours && <span className="text-muted">Working hours {hoursLabel(employee.workHours)}</span>}
      </div>
      <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line">
        <Table head={["Date", "Clock in", ...(rows.some((a) => a.punctuality) ? ["Arrival"] : []), "Clock out", "Hours"]}>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="tabular">{fmtDate(a.date, "EEE dd MMM")}</td>
              <td className={cx("tabular", arrivalText(a))}>{fmtTime(a.clockIn)}</td>
              {rows.some((x) => x.punctuality) && <td><ArrivalBadge a={a} /></td>}
              <td className="tabular">{a.clockOut ? fmtTime(a.clockOut) : <Badge tone="sun">No clock-out</Badge>}</td>
              <td className="tabular">{a.clockOut ? hoursWorked(a).toFixed(1) : "—"}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-sm text-muted">No attendance recorded this month.</td>
            </tr>
          )}
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Attendance shows <b>{fromAttendance} {unit}</b>
        {!daily && open > 0 && ` (${open} day${open > 1 ? "s" : ""} without a clock-out not counted)`}.{" "}
        {Number(units) !== fromAttendance && <button onClick={() => { setUnits(String(fromAttendance)); setAmount(null); }} className="font-bold text-navy hover:underline">Use {fromAttendance}</button>}
      </p>
      <div className="mt-4 grid gap-4 rounded-xl bg-[#faf7f1] p-4 sm:grid-cols-3">
        <Field label={daily ? "Days to pay" : "Hours to pay"}>
          <Input type="number" min={0} step={daily ? 0.5 : 0.25} value={units} onChange={(e) => { setUnits(e.target.value); setAmount(null); }} />
        </Field>
        <Field label="Amount to pay (Rs.)" hint={amount === null ? `${n} × ${money(rate)}` : <button onClick={() => setAmount(null)} className="font-bold text-navy hover:underline">Use {money(calculated)} ({n} × {money(rate)})</button>}>
          <Input type="number" min={0} value={amount ?? calculated} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="self-center text-sm">
          <div className="text-xs text-muted">Allowances, overtime, EPF/ETF and deductions are added on the payroll line.</div>
        </div>
      </div>
    </Modal>
  );
}

function MiniToggle({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold disabled:opacity-40", on ? "bg-mint-soft text-[#2f8f72]" : "bg-[#f1eee8] text-muted line-through")}>
      {label}
    </button>
  );
}

function R({ l, r, b }: { l: string; r: number; b?: boolean }) {
  return <div className={cx("flex justify-between py-0.5", b && "font-bold")}><span>{l}</span><span className="tabular">{money(r, false)}</span></div>;
}

function Payslip({ run, line, onClose }: { run: PayrollRun; line: PayLine; onClose: () => void }) {
  const e = useStore((s) => s.employees.find((x) => x.id === line.employeeId))!;
  const settings = useStore((s) => s.settings);
  const newReport = useNewReport();
  const downloadPdf = async () => {
    const monthLabel = format(new Date(run.month + "-01"), "MMMM yyyy");
    const p = await newReport("Payslip", monthLabel);
    p.details([["Employee", e.name], ["Employee code", e.code], ["Designation", e.designation || "-"], ["EPF number", e.epfNo || "-"], ["NIC", e.nic || "-"], ["Bank", e.bank || "-"]]);
    p.statement(["Amount (Rs.)"], [
      { kind: "section", label: "Earnings" },
      { kind: "line", label: unitsLabel(line) ? `${basicLabel(line)} (${unitsLabel(line)})` : basicLabel(line), values: [line.basic] },
      ...lineAllowances(line).map((a) => ({ kind: "line" as const, label: `${a.name}${a.epf ? "" : " *"}`, values: [a.amount] })),
      { kind: "line", label: `Overtime (${line.otHours} hours)`, values: [line.otPay] },
      { kind: "subtotal", label: "Gross pay", values: [line.gross] },
      { kind: "section", label: "Deductions" },
      { kind: "line", label: `EPF — employee contribution ${settings.epfEmployeePct}%`, values: [line.epfEmployee], neg: true },
      ...lineDeductions(line).map((d) => ({ kind: "line" as const, label: d.name, values: [d.amount], neg: true })),
      { kind: "subtotal", label: "Total deductions", values: [line.epfEmployee + line.deductions], neg: true },
      { kind: "grand", label: "Net pay", values: [line.net] },
    ]);
    p.heading("Employer contributions (not deducted from pay)");
    p.table(["Contribution", "Amount (Rs.)"], [[`EPF — employer ${settings.epfEmployerPct}%`, line.epfEmployer], [`ETF — employer ${settings.etfPct}%`, line.etfEmployer]], { align: ["l", "r"] });
    if (lineAllowances(line).some((a) => !a.epf)) p.paragraph("* Not included in the EPF/ETF base.");
    p.paragraph(`Payroll status: ${run.status === "paid" ? `paid${run.paidAt ? ` on ${fmtDate(run.paidAt)}` : ""}` : "draft — not yet paid"}.`);
    p.signatures(["Authorised by", "Received by (employee)"]);
    p.save(`payslip_${e.code}_${run.month}`);
  };
  return (
    <Modal open onClose={onClose} title="Payslip" width="max-w-lg" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={<FileText size={15} />} onClick={() => downloadPdf().catch(() => toast("Couldn't create the PDF", "err"))}>Download PDF</Button></>}>
      <div className="print-area rounded-xl border border-line bg-white p-6 text-sm">
        <div className="flex items-start justify-between border-b border-line pb-3">
          <div>
            <div className="font-display text-xl font-semibold text-navy">{settings.businessName}</div>
            <div className="text-xs text-muted">{settings.address}</div>
          </div>
          <div className="text-right">
            <div className="font-bold">PAYSLIP</div>
            <div className="text-xs text-muted">{format(new Date(run.month + "-01"), "MMMM yyyy")}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 py-3 text-xs">
          <div><span className="text-muted">Name:</span> <b>{e.name}</b></div>
          <div><span className="text-muted">Code:</span> {e.code}</div>
          <div><span className="text-muted">Designation:</span> {e.designation}</div>
          <div><span className="text-muted">EPF No:</span> {e.epfNo || "—"}</div>
          <div className="col-span-2"><span className="text-muted">Bank:</span> {e.bank}</div>
        </div>
        <div className="grid gap-6 border-t border-line pt-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-bold uppercase text-muted">Earnings</div>
            <R l={unitsLabel(line) ? `${basicLabel(line)} (${unitsLabel(line)})` : basicLabel(line)} r={line.basic} />
            {lineAllowances(line).map((a, i) => <R key={i} l={a.name} r={a.amount} />)}
            <R l={`Overtime (${line.otHours}h)`} r={line.otPay} />
            <R l="Gross" r={line.gross} b />
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase text-muted">Deductions</div>
            <R l={`EPF employee ${settings.epfEmployeePct}%`} r={line.epfEmployee} />
            {lineDeductions(line).map((d, i) => <R key={i} l={d.name} r={d.amount} />)}
            <R l="Total deductions" r={line.epfEmployee + line.deductions} b />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-mint-soft px-4 py-3">
          <span className="font-bold">Net pay</span>
          <span className="font-display text-2xl font-semibold">{money(line.net)}</span>
        </div>
        <div className="mt-3 text-xs text-muted">Employer contributions (not deducted): EPF {settings.epfEmployerPct}% {money(line.epfEmployer)} · ETF {settings.etfPct}% {money(line.etfEmployer)}</div>
      </div>
    </Modal>
  );
}

/** One employee's allowances and deductions for this month only — the Staff record is not changed. */
function AdjustLine({ month, line, employee, onClose, onSave }: { month: string; line: PayLine; employee: Employee; onClose: () => void; onSave: (allowances: PayItem[], deductions: PayItem[]) => void }) {
  const settings = useStore((s) => s.settings);
  const [allowances, setAllowances] = useState<PayItem[]>(() => lineAllowances(line));
  const [deductions, setDeductions] = useState<PayItem[]>(() => lineDeductions(line));
  const preview = calcPayLine({ ...employee, epf: line.epf, etf: line.etf, rate: line.rate ?? employee.rate }, settings, line.otHours, { allowances, deductions, ...kept(line) });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${employee.name} — ${format(new Date(month + "-01"), "MMMM yyyy")}`}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => { setAllowances(employee.allowances ?? []); setDeductions(employee.deductions ?? []); }}>Reset to Staff record</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(cleanItems(allowances), cleanItems(deductions))}>Save for this month</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">Changes apply to this month&apos;s payroll only. To change what is paid every month, edit the employee on the Staff page.</p>
      <div className="mb-1 text-[13px] font-bold text-ink/80">Allowances</div>
      <PayItemsEditor kind="allowance" items={allowances} onChange={setAllowances} />
      <div className="mb-1 mt-5 text-[13px] font-bold text-ink/80">Deductions</div>
      <PayItemsEditor kind="deduction" items={deductions} onChange={setDeductions} />
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#faf7f1] p-4 text-sm sm:grid-cols-4">
        <div><div className="text-xs text-muted">Gross pay</div><div className="font-bold tabular">{money(preview.gross)}</div></div>
        <div><div className="text-xs text-muted">EPF {settings.epfEmployeePct}% (employee)</div><div className="font-bold tabular">{preview.epfEmployee ? `-${money(preview.epfEmployee)}` : "—"}</div></div>
        <div><div className="text-xs text-muted">Other deductions</div><div className="font-bold tabular">{preview.deductions ? `-${money(preview.deductions)}` : "—"}</div></div>
        <div><div className="text-xs text-muted">Net pay</div><div className="font-bold tabular text-[#2f8f72]">{money(preview.net)}</div></div>
      </div>
      {preview.net < 0 && <p className="mt-2 text-xs font-bold text-[#c24f69]">Deductions are more than the pay for this month.</p>}
    </Modal>
  );
}
