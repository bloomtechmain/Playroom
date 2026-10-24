"use client";

import { useMemo, useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { FileText, Printer, RefreshCw } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { calcPayLine, otHoursFor } from "@/lib/payroll";
import type { PayLine, PayrollRun } from "@/lib/types";
import { cx, fmtDate, money, uid } from "@/lib/utils";
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
  const run = runs.find((r) => r.month === month);
  const editable = can("payroll.run") && run?.status === "draft";

  const prepare = () => {
    const lines = employees.filter((e) => e.active).map((e) => calcPayLine(e, settings, otHoursFor(attendance, e.id, month, settings.standardHours), 0));
    const r: PayrollRun = { id: uid("pay-"), month, status: "draft", lines, createdAt: new Date().toISOString(), createdBy: me ?? "" };
    save("payroll", r, "Payroll", `Prepared payroll ${month}`);
    toast("Draft payroll prepared from attendance");
  };

  const updateLine = (empId: string, patch: Partial<Pick<PayLine, "otHours" | "deductions" | "epf" | "etf">>) => {
    if (!run) return;
    const lines = run.lines.map((l) => {
      if (l.employeeId !== empId) return l;
      const e = employees.find((x) => x.id === empId)!;
      const next = { ...l, ...patch };
      return calcPayLine({ ...e, epf: next.epf, etf: next.etf }, settings, next.otHours, next.deductions);
    });
    save("payroll", { ...run, lines }, "Payroll", `Edited ${month}`, { quiet: true });
  };

  const recalc = () => {
    if (!run) return;
    const lines = run.lines.map((l) => {
      const e = employees.find((x) => x.id === l.employeeId)!;
      return calcPayLine({ ...e, epf: l.epf, etf: l.etf }, settings, l.otHours, l.deductions);
    });
    save("payroll", { ...run, lines }, "Payroll", `Recalculated ${month}`);
    toast("Recalculated with current EPF/ETF settings");
  };

  const pay = async () => {
    if (!run) return;
    // marks the run paid and posts salaries + employer EPF/ETF to expenses in one go
    if (await payPayroll(run.id)) toast("Payroll paid and posted to expenses");
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
            <Toggle disabled={!can("payroll.run")} checked={settings.epfIncludesAllowance} onChange={(v) => setSettings({ epfIncludesAllowance: v }, "EPF base changed")} label="Include fixed allowances in EPF/ETF base" />
            <p className="text-xs text-muted">Contributions are calculated on basic salary{settings.epfIncludesAllowance ? " + fixed allowances" : ""}. Overtime is excluded. Each employee can also be opted out individually (e.g. part-time staff) from the Staff page or in a draft run.</p>
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
            <Table head={["Employee", "Basic", "Allowance", "OT hrs", "OT pay", "Deductions", "Gross", `EPF ${settings.epfEmployeePct}%`, "Net pay", `EPF ${settings.epfEmployerPct}%`, `ETF ${settings.etfPct}%`, "EPF / ETF", ""]}>
              {run.lines.map((l) => {
                const e = employees.find((x) => x.id === l.employeeId)!;
                return (
                  <tr key={l.employeeId}>
                    <td><div className="font-bold">{e.name}</div><div className="text-xs text-muted">{e.designation}</div></td>
                    <td className="tabular">{money(l.basic, false)}</td>
                    <td className="tabular">{money(l.allowance, false)}</td>
                    <td>{editable ? <Input className="h-8 w-16" type="number" value={l.otHours} onChange={(ev) => updateLine(l.employeeId, { otHours: Number(ev.target.value) })} /> : <span className="tabular">{l.otHours}</span>}</td>
                    <td className="tabular">{money(l.otPay, false)}</td>
                    <td>{editable ? <Input className="h-8 w-24" type="number" value={l.deductions} onChange={(ev) => updateLine(l.employeeId, { deductions: Number(ev.target.value) })} /> : <span className="tabular">{money(l.deductions, false)}</span>}</td>
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
                    <td><button title="Payslip" onClick={() => setSlip({ run, line: l })} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><FileText size={15} /></button></td>
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
          {run.status === "draft" && <p className="mt-3 text-xs text-muted">OT hours are pulled from QR attendance (hours beyond {settings.standardHours}h + 1h break per day). Adjust before paying.</p>}
        </>
      )}
      {!run && (
        <Card><p className="py-8 text-center text-sm text-muted">No payroll for {format(new Date(month + "-01"), "MMMM yyyy")} yet.{can("payroll.run") && " Prepare it to pull in salaries and overtime from attendance."}</p></Card>
      )}
      {slip && <Payslip run={slip.run} line={slip.line} onClose={() => setSlip(null)} />}
    </>
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
  return (
    <Modal open onClose={onClose} title="Payslip" width="max-w-lg" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button></>}>
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
            <R l="Basic salary" r={line.basic} />
            <R l="Fixed allowance" r={line.allowance} />
            <R l={`Overtime (${line.otHours}h)`} r={line.otPay} />
            <R l="Gross" r={line.gross} b />
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase text-muted">Deductions</div>
            <R l={`EPF employee ${settings.epfEmployeePct}%`} r={line.epfEmployee} />
            <R l="Advances / no-pay" r={line.deductions} />
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
