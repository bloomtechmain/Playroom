"use client";

import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { hoursWorked } from "@/lib/payroll";
import type { Attendance } from "@/lib/types";
import { cx, fmtDate, fmtTime, timeToMin, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Table, Tabs, toast } from "@/components/ui";
import { Avatar } from "@/components/Shell";

export default function AttendancePage() {
  const can = useCan();
  if (!can("hr.view")) return <NoAccess what="attendance" />;
  return <Inner />;
}

const localHM = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

function Inner() {
  const can = useCan();
  const employees = useStore((s) => s.employees);
  const attendance = useStore((s) => s.attendance);
  const settings = useStore((s) => s.settings);
  const save = useStore((s) => s.save);
  const [tab, setTab] = useState<"today" | "month" | "log">("today");
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [date, setDate] = useState("");
  const [edit, setEdit] = useState<{ a: Attendance; inT: string; outT: string } | null>(null);
  const d = today();
  const late = (a: Attendance) => localHM(a.clockIn) > timeToMin(settings.workStart) + 10;

  const summary = useMemo(
    () =>
      employees.map((e) => {
        const rows = attendance.filter((a) => a.employeeId === e.id && a.date.startsWith(month));
        const hrs = rows.reduce((s, a) => s + hoursWorked(a), 0);
        const ot = rows.filter((a) => a.clockOut).reduce((s, a) => s + Math.max(0, hoursWorked(a) - settings.standardHours - 1), 0);
        return { e, days: rows.length, hrs, ot, late: rows.filter(late).length, manual: rows.filter((a) => a.method === "manual").length };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, attendance, month, settings],
  );

  const log = attendance.filter((a) => (date ? a.date === date : a.date.startsWith(month))).sort((a, b) => b.clockIn.localeCompare(a.clockIn)).slice(0, 200);

  const openEdit = (a: Attendance) => setEdit({ a, inT: format(new Date(a.clockIn), "HH:mm"), outT: a.clockOut ? format(new Date(a.clockOut), "HH:mm") : "" });
  const saveEdit = () => {
    if (!edit) return;
    const mk = (t: string) => new Date(`${edit.a.date}T${t}:00`).toISOString();
    const item: Attendance = { ...edit.a, clockIn: mk(edit.inT), clockOut: edit.outT ? mk(edit.outT) : undefined, method: "manual" };
    save("attendance", item, "HR", `Manual attendance for ${employees.find((x) => x.id === item.employeeId)?.name} on ${item.date}`);
    toast("Attendance saved (marked manual)");
    setEdit(null);
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Staff clock in and out by scanning their QR badge at the kiosk."
        actions={
          <>
            <a href="/kiosk" target="_blank"><Button variant="secondary" icon={<ExternalLink size={15} />}>Open kiosk</Button></a>
            {can("hr.edit") && <Button icon={<Plus size={16} />} onClick={() => setEdit({ a: { id: uid("at"), employeeId: employees[0].id, date: d, clockIn: new Date().toISOString(), method: "manual" }, inT: settings.workStart, outT: "" })}>Manual entry</Button>}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: "today", label: "Today" }, { value: "month", label: "Monthly summary" }, { value: "log", label: "Clock log" }]} />
        {tab !== "today" && (
          <Select className="w-48" value={month} onChange={(e) => { setMonth(e.target.value); setDate(""); }}>
            {[0, 1, 2].map((m) => { const v = format(subMonths(new Date(), m), "yyyy-MM"); return <option key={v} value={v}>{format(new Date(v + "-01"), "MMMM yyyy")}</option>; })}
          </Select>
        )}
        {tab === "log" && <Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} />}
      </div>

      {tab === "today" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.filter((e) => e.active).map((e) => {
            const a = attendance.find((x) => x.employeeId === e.id && x.date === d);
            return (
              <Card key={e.id}>
                <div className="flex items-center gap-3">
                  <Avatar name={e.name} size={40} />
                  <div className="flex-1">
                    <div className="font-bold">{e.name}</div>
                    <div className="text-xs text-muted">{e.designation}</div>
                  </div>
                  {a ? (a.clockOut ? <Badge tone="sky">Clocked out</Badge> : <Badge tone="mint">On site</Badge>) : <Badge tone="gray">Not in</Badge>}
                </div>
                {a && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-[#faf7f1] py-2"><div className="text-muted">In</div><div className={cx("font-bold tabular", late(a) && "text-[#c24f69]")}>{fmtTime(a.clockIn)}</div></div>
                    <div className="rounded-lg bg-[#faf7f1] py-2"><div className="text-muted">Out</div><div className="font-bold tabular">{a.clockOut ? fmtTime(a.clockOut) : "—"}</div></div>
                    <div className="rounded-lg bg-[#faf7f1] py-2"><div className="text-muted">Hours</div><div className="font-bold tabular">{hoursWorked(a).toFixed(1)}</div></div>
                  </div>
                )}
                {a && late(a) && <p className="mt-2 text-xs font-bold text-[#c24f69]">Late — shift starts {settings.workStart}</p>}
              </Card>
            );
          })}
        </div>
      )}

      {tab === "month" && (
        <Card pad={false}>
          <Table head={["Employee", "Days present", "Hours worked", "Overtime (h)", "Late arrivals", "Manual edits"]}>
            {summary.map((r) => (
              <tr key={r.e.id}>
                <td className="font-bold">{r.e.name}</td>
                <td className="tabular">{r.days}</td>
                <td className="tabular">{r.hrs.toFixed(1)}</td>
                <td className="tabular">{r.ot.toFixed(1)}</td>
                <td>{r.late ? <Badge tone="rose">{r.late}</Badge> : <span className="text-muted">0</span>}</td>
                <td className="tabular text-muted">{r.manual}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "log" && (
        <Card pad={false}>
          <Table head={["Date", "Employee", "Clock in", "Clock out", "Hours", "Method", ""]}>
            {log.map((a) => (
              <tr key={a.id}>
                <td className="tabular">{fmtDate(a.date, "EEE dd MMM")}</td>
                <td className="font-bold">{employees.find((e) => e.id === a.employeeId)?.name}</td>
                <td className={cx("tabular", late(a) && "font-bold text-[#c24f69]")}>{fmtTime(a.clockIn)}</td>
                <td className="tabular">{a.clockOut ? fmtTime(a.clockOut) : <Badge tone="mint">On site</Badge>}</td>
                <td className="tabular">{hoursWorked(a).toFixed(1)}</td>
                <td>{a.method === "qr" ? <Badge tone="sky">QR scan</Badge> : <Badge tone="sun">Manual</Badge>}</td>
                <td className="text-right">{can("hr.edit") && <button onClick={() => openEdit(a)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={14} /></button>}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Attendance entry" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={saveEdit}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee" className="sm:col-span-2">
              <Select value={edit.a.employeeId} onChange={(e) => setEdit({ ...edit, a: { ...edit.a, employeeId: e.target.value } })}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
            </Field>
            <Field label="Date"><Input type="date" value={edit.a.date} onChange={(e) => setEdit({ ...edit, a: { ...edit.a, date: e.target.value } })} /></Field>
            <div />
            <Field label="Clock in"><Input type="time" value={edit.inT} onChange={(e) => setEdit({ ...edit, inT: e.target.value })} /></Field>
            <Field label="Clock out"><Input type="time" value={edit.outT} onChange={(e) => setEdit({ ...edit, outT: e.target.value })} /></Field>
          </div>
          <p className="mt-3 text-xs text-muted">Manual entries are flagged and recorded in the audit log.</p>
        </Modal>
      )}
    </>
  );
}
