"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Pencil, Plus, Printer, QrCode, RefreshCw } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { Employee } from "@/lib/types";
import { cx, fmtDate, fmtTime, money, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Stat, Table, Toggle, toast } from "@/components/ui";
import { Avatar, Logo } from "@/components/Shell";

export default function StaffPage() {
  const can = useCan();
  if (!can("hr.view")) return <NoAccess what="staff records" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const employees = useStore((s) => s.employees);
  const attendance = useStore((s) => s.attendance);
  const save = useStore((s) => s.save);
  const [edit, setEdit] = useState<Employee | null>(null);
  const [badge, setBadge] = useState<Employee | null>(null);
  const d = today();
  const todayAtt = attendance.filter((a) => a.date === d);
  const inNow = todayAtt.filter((a) => !a.clockOut).length;
  const payrollCost = employees.filter((e) => e.active).reduce((a, e) => a + e.basic + e.allowance, 0);

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Team records, salaries and QR badges for clocking in."
        actions={can("hr.edit") && <Button icon={<Plus size={16} />} onClick={() => setEdit({ id: "", code: `EMP-${101 + employees.length}`, name: "", designation: "", phone: "", nic: "", joinDate: d, basic: 45000, allowance: 0, otRate: 280, epf: true, etf: true, epfNo: "", bank: "", active: true, qrToken: Math.random().toString(36).slice(2, 9).toUpperCase(), color: "sky" })}>Add employee</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active staff" value={employees.filter((e) => e.active).length} tone="sky" />
        <Stat label="On site now" value={inNow} sub={`${todayAtt.length} clocked in today`} tone="mint" />
        <Stat label="Monthly fixed salaries" value={money(payrollCost)} tone="lilac" />
        <Stat label="EPF/ETF registered" value={employees.filter((e) => e.epf).length} sub={`${employees.filter((e) => !e.epf).length} opted out`} tone="sun" />
      </div>
      <Card pad={false}>
        <Table head={["Employee", "Designation", "Phone", "Joined", "Basic + allowance", "EPF / ETF", "Today", ""]}>
          {employees.map((e) => {
            const a = todayAtt.find((x) => x.employeeId === e.id);
            return (
              <tr key={e.id} className={cx(!e.active && "opacity-50")}>
                <td>
                  <div className="flex items-center gap-3">
                    <Avatar name={e.name} size={32} />
                    <div>
                      <div className="font-bold">{e.name}</div>
                      <div className="font-mono text-[11px] text-muted">{e.code}</div>
                    </div>
                  </div>
                </td>
                <td>{e.designation}</td>
                <td className="tabular text-muted">{e.phone}</td>
                <td className="tabular text-muted">{fmtDate(e.joinDate)}</td>
                <td className="tabular">{money(e.basic + e.allowance)}</td>
                <td className="text-xs">{e.epf ? <Badge tone="mint">EPF {e.etf && "+ ETF"}</Badge> : <Badge tone="gray">Not enrolled</Badge>}</td>
                <td>{!e.active ? <Badge tone="gray">Inactive</Badge> : a ? (a.clockOut ? <Badge tone="sky">Left {fmtTime(a.clockOut)}</Badge> : <Badge tone="mint">In since {fmtTime(a.clockIn)}</Badge>) : <Badge tone="gray">Not in</Badge>}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button title="QR badge" onClick={() => setBadge(e)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><QrCode size={15} /></button>
                    {can("hr.edit") && <button title="Edit" onClick={() => setEdit(e)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={15} /></button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : "New employee"} width="max-w-2xl" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit.name) return; const item = edit.id ? edit : { ...edit, id: uid("e") }; save("employees", item, "HR", `Employee ${item.name}`); toast("Saved"); setEdit(null); }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Employee code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="Designation"><Input value={edit.designation} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} /></Field>
            <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="NIC"><Input value={edit.nic} onChange={(e) => setEdit({ ...edit, nic: e.target.value })} /></Field>
            <Field label="Join date"><Input type="date" value={edit.joinDate} onChange={(e) => setEdit({ ...edit, joinDate: e.target.value })} /></Field>
            <Field label="Basic salary (Rs.)"><Input type="number" value={edit.basic} onChange={(e) => setEdit({ ...edit, basic: Number(e.target.value) })} /></Field>
            <Field label="Fixed allowance (Rs.)"><Input type="number" value={edit.allowance} onChange={(e) => setEdit({ ...edit, allowance: Number(e.target.value) })} /></Field>
            <Field label="OT rate / hour (Rs.)"><Input type="number" value={edit.otRate} onChange={(e) => setEdit({ ...edit, otRate: Number(e.target.value) })} /></Field>
            <Field label="EPF number"><Input value={edit.epfNo} onChange={(e) => setEdit({ ...edit, epfNo: e.target.value })} /></Field>
            <Field label="Bank & account" className="sm:col-span-2"><Input value={edit.bank} onChange={(e) => setEdit({ ...edit, bank: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-6 sm:col-span-3">
              <Toggle checked={edit.epf} onChange={(v) => setEdit({ ...edit, epf: v })} label="Contribute EPF" />
              <Toggle checked={edit.etf} onChange={(v) => setEdit({ ...edit, etf: v })} label="Contribute ETF" />
              <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active (badge works)" />
            </div>
          </div>
        </Modal>
      )}

      {badge && (
        <Modal open onClose={() => setBadge(null)} title="Staff QR badge" width="max-w-sm" footer={<>
          {can("hr.edit") && <Button variant="ghost" className="mr-auto" icon={<RefreshCw size={14} />} onClick={() => { const nb = { ...badge, qrToken: Math.random().toString(36).slice(2, 9).toUpperCase() }; save("employees", nb, "HR", `Re-issued QR badge for ${badge.name} (old badge revoked)`); setBadge(nb); toast("New badge issued — old one no longer works"); }}>Re-issue</Button>}
          <Button icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
        </>}>
          <div className="print-area mx-auto w-[240px] overflow-hidden rounded-2xl border border-line bg-white text-center">
            <div className="flex h-3">{["bg-navy", "bg-sky", "bg-lilac", "bg-mint", "bg-rose", "bg-sun", "bg-teal"].map((c) => <span key={c} className={cx("flex-1", c)} />)}</div>
            <div className="p-4">
              <Logo className="mx-auto w-[120px]" />
              <div className="mt-3 font-display text-lg font-semibold">{badge.name}</div>
              <div className="text-xs text-muted">{badge.designation}</div>
              <div className="my-3 flex justify-center"><QRCodeSVG value={`PLAYROOM-STAFF:${badge.qrToken}`} size={140} fgColor="#24395f" /></div>
              <div className="font-mono text-xs text-muted">{badge.code}</div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Scan at the <a className="font-bold text-navy" href="/kiosk" target="_blank">clock-in kiosk</a> to clock in and out.</p>
        </Modal>
      )}
    </>
  );
}
