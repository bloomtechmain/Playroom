"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { eachMonthOfInterval, format, subMonths } from "date-fns";
import { Download, Plus, Trash2 } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { activeKpis, attendanceWeight, evaluationAverage, evaluationId, fmtScore, performanceOf, SUGGESTED_KPIS } from "@/lib/performance";
import type { Employee, Kpi } from "@/lib/types";
import { fmtDate, uid } from "@/lib/utils";
import { useNewReport } from "@/lib/useNewReport";
import { Button, Card, Field, Input, NoAccess, PageHeader, Select, Stat, Table, Tabs, Toggle, toast } from "@/components/ui";
import { EvaluateModal, ScoreBadge } from "@/components/StaffDevelopment";

export default function PerformancePage() {
  const can = useCan();
  // KPIs, marks and reports: administrators and the owner
  if (!can("hr.evaluate")) return <NoAccess what="staff performance" />;
  return <Inner />;
}

const ym = (d: Date) => format(d, "yyyy-MM");
const monthName = (m: string, f = "MMMM yyyy") => format(new Date(m + "-01"), f);
const lastMonths = (n: number) => Array.from({ length: n }, (_, i) => ym(subMonths(new Date(), i)));

function Inner() {
  const settings = useStore((s) => s.settings);
  const [tab, setTab] = useState<"scores" | "report" | "kpis">(() => (activeKpis(settings).length ? "scores" : "kpis"));
  return (
    <>
      <PageHeader title="Performance" subtitle="Score staff 0–10 on your own KPIs each month; attendance (arrivals on time) counts towards the overall score. Only administrators and the owner see this." />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} items={[{ value: "scores", label: "Monthly scores" }, { value: "report", label: "Evaluation report" }, { value: "kpis", label: "KPIs" }]} />
      </div>
      {tab === "scores" && <Scores />}
      {tab === "report" && <Report />}
      {tab === "kpis" && <KpiSetup />}
    </>
  );
}

function Scores() {
  const settings = useStore((s) => s.settings);
  const employees = useStore((s) => s.employees);
  const evaluations = useStore((s) => s.evaluations);
  const attendance = useStore((s) => s.attendance);
  const trainings = useStore((s) => s.trainings);
  const [month, setMonth] = useState(ym(new Date()));
  const [evaluate, setEvaluate] = useState<Employee | null>(null);
  const kpis = activeKpis(settings);
  const staff = employees.filter((e) => e.active || evaluations.some((x) => x.employeeId === e.id && x.period === month));
  const scored = staff.filter((e) => evaluations.some((x) => x.id === evaluationId(e.id, month))).length;
  if (!kpis.length) return <Card><p className="py-8 text-center text-sm text-muted">Add KPIs on the KPIs tab first.</p></Card>;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select className="w-52" value={month} onChange={(e) => setMonth(e.target.value)}>
          {lastMonths(12).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </Select>
        <span className="text-sm text-muted">{scored} of {staff.length} scored</span>
      </div>
      <Card pad={false}>
        <Table head={["Employee", ...kpis.map((k) => k.name), "KPI average", "Attendance", "Overall", ""]}>
          {staff.map((e) => {
            const ev = evaluations.find((x) => x.id === evaluationId(e.id, month));
            const p = performanceOf(e.id, { evaluations, attendance, trainings, settings }, month, month);
            return (
              <tr key={e.id}>
                <td><Link href={`/staff/${e.id}`} className="font-bold hover:text-navy hover:underline">{e.name}</Link><div className="text-xs text-muted">{e.designation}</div></td>
                {kpis.map((k) => <td key={k.id}><ScoreBadge value={ev?.scores[k.id]} /></td>)}
                <td><ScoreBadge value={evaluationAverage(ev, settings)} /></td>
                <td><ScoreBadge value={p.attendance.score} /></td>
                <td><ScoreBadge value={ev ? p.overall : undefined} /></td>
                <td className="text-right"><Button size="sm" variant={ev ? "secondary" : "primary"} onClick={() => setEvaluate(e)}>{ev ? "Edit" : "Score"}</Button></td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Attendance score = clock-ins on time or early ÷ clock-ins measured against the employee&apos;s working hours, out of 10 (blank when no working hours are set).
        Overall = weighted average of the KPI marks and the attendance score (weights on the KPIs tab).
      </p>
      {evaluate && <EvaluateModal employee={evaluate} period={month} onClose={() => setEvaluate(null)} />}
    </>
  );
}

function Report() {
  const settings = useStore((s) => s.settings);
  const employees = useStore((s) => s.employees);
  const evaluations = useStore((s) => s.evaluations);
  const attendance = useStore((s) => s.attendance);
  const trainings = useStore((s) => s.trainings);
  const users = useStore((s) => s.users);
  const months = lastMonths(24);
  const [from, setFrom] = useState(months[5]);
  const [to, setTo] = useState(months[0]);
  const [who, setWho] = useState("all");
  const kpis = activeKpis(settings);
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;
  const period = lo === hi ? monthName(lo) : `${monthName(lo, "MMM yyyy")} – ${monthName(hi, "MMM yyyy")}`;
  const data = { evaluations, attendance, trainings, settings };

  const rows = useMemo(
    () =>
      employees
        .filter((e) => (who === "all" ? e.active || evaluations.some((x) => x.employeeId === e.id && x.period >= lo && x.period <= hi) : e.id === who))
        .map((e) => ({ e, p: performanceOf(e.id, { evaluations, attendance, trainings, settings }, lo, hi) }))
        .sort((a, b) => (b.p.overall ?? -1) - (a.p.overall ?? -1)),
    [employees, evaluations, attendance, trainings, settings, who, lo, hi],
  );
  const scoredRows = rows.filter((r) => r.p.overall !== undefined);
  const teamAvg = scoredRows.length ? scoredRows.reduce((a, r) => a + r.p.overall!, 0) / scoredRows.length : undefined;
  const attRows = rows.filter((r) => r.p.attendance.score !== undefined);
  const attAvg = attRows.length ? attRows.reduce((a, r) => a + r.p.attendance.score!, 0) / attRows.length : undefined;

  const newReport = useNewReport();
  const pdf = async () => {
    const one = who !== "all" ? rows[0] : undefined;
    const p = await newReport(one ? `Staff evaluation — ${one.e.name}` : "Staff evaluation report", period, { landscape: !one });
    if (one) {
      const e = one.e;
      p.details([["Employee", e.name], ["Code", e.code], ["Designation", e.designation || "-"], ["Joined", fmtDate(e.joinDate)], ["Overall score", `${fmtScore(one.p.overall)} / 10`], ["Months scored", String(one.p.months)]]);
      p.heading("KPI marks (average over the period, 0–10)");
      p.table(["KPI", "Weight", "Average"], [...kpis.map((k) => [k.name, k.weight, fmtScore(one.p.kpi[k.id])]), ["Attendance (arrivals on time)", attendanceWeight(settings), fmtScore(one.p.attendance.score)]], { align: ["l", "r", "r"] });
      p.heading("Month by month");
      const ms = eachMonthOfInterval({ start: new Date(lo + "-01"), end: new Date(hi + "-01") }).map(ym).reverse();
      p.table(
        ["Month", ...kpis.map((k) => k.name), "Attendance", "Overall", "Notes"],
        ms.map((m) => {
          const ev = evaluations.find((x) => x.id === evaluationId(e.id, m));
          const pm = performanceOf(e.id, data, m, m);
          return [monthName(m, "MMM yyyy"), ...kpis.map((k) => fmtScore(ev?.scores[k.id])), fmtScore(pm.attendance.score), ev ? fmtScore(pm.overall) : "—", ev?.notes || ""];
        }),
      );
      const a = one.p.attendance;
      p.heading("Attendance");
      p.details([["Days present", String(a.days)], ["Hours worked", a.hours.toFixed(1)], ["On time", String(a.onTime)], ["Early", String(a.early)], ["Late", `${a.late}${a.lateMinutes ? ` (${a.lateMinutes} min in total)` : ""}`], ["On days off", String(a.offDay)]]);
      if (one.p.trainings.length) {
        p.heading("Training in the period");
        p.table(["Date", "Training", "Trainer", "Hours"], one.p.trainings.map((t) => [fmtDate(t.date), t.title, t.trainer || "-", t.hours]), { align: ["l", "l", "l", "r"] });
      }
      if (e.qualifications?.length) {
        p.heading("Qualifications");
        p.table(["Qualification", "Institution", "Year"], e.qualifications.map((q) => [q.title, q.institution || "-", q.year || "-"]));
      }
      const by = evaluations.filter((x) => x.employeeId === e.id && x.period >= lo && x.period <= hi).map((x) => users.find((u) => u.id === x.evaluatedBy)?.name).filter(Boolean);
      if (by.length) p.paragraph(`Scored by ${[...new Set(by)].join(", ")}.`, { muted: true });
      p.signatures(["Evaluated by", "Employee"]);
      p.save(`evaluation_${e.code}_${lo}_${hi}`);
      return;
    }
    p.kpis([
      { label: "Staff in report", value: String(rows.length) },
      { label: "Team average (overall)", value: `${fmtScore(teamAvg)} / 10` },
      { label: "Average attendance score", value: `${fmtScore(attAvg)} / 10` },
      { label: "Training hours", value: String(rows.reduce((a, r) => a + r.p.trainingHours, 0)) },
    ]);
    p.table(
      ["Employee", ...kpis.map((k) => k.name), "Days", "Late", "Attendance", "Training h", "Overall"],
      rows.map(({ e, p: x }) => [e.name, ...kpis.map((k) => fmtScore(x.kpi[k.id])), x.attendance.days, x.attendance.late, fmtScore(x.attendance.score), x.trainingHours, fmtScore(x.overall)]),
      { align: ["l", ...kpis.map(() => "r" as const), "r", "r", "r", "r", "r"] },
    );
    p.paragraph(
      `Marks are 0–10, averaged over the months scored in the period. Attendance score = clock-ins on time or early ÷ clock-ins measured against each employee's working hours, out of 10. Overall = weighted average (${kpis.map((k) => `${k.name} ×${k.weight}`).join(", ")}, attendance ×${attendanceWeight(settings)}).`,
      { muted: true },
    );
    p.save(`staff-evaluation_${lo}_${hi}`);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From"><Select className="w-44" value={from} onChange={(e) => setFrom(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select></Field>
        <Field label="To"><Select className="w-44" value={to} onChange={(e) => setTo(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select></Field>
        <Field label="Staff">
          <Select className="w-56" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <div className="flex-1" />
        <Button icon={<Download size={15} />} disabled={!rows.length} onClick={() => pdf().catch(() => toast("Couldn't create the PDF", "err"))}>{who === "all" ? "Report PDF" : "Employee report PDF"}</Button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Team average" value={<ScoreBadge value={teamAvg} className="text-base" />} sub={`${scoredRows.length} of ${rows.length} with marks`} tone="mint" />
        <Stat label="Average attendance score" value={<ScoreBadge value={attAvg} className="text-base" />} sub="arrivals on time or early" tone="sky" />
        <Stat label="Late arrivals" value={rows.reduce((a, r) => a + r.p.attendance.late, 0)} sub={period} tone="rose" />
        <Stat label="Training hours" value={rows.reduce((a, r) => a + r.p.trainingHours, 0)} sub={period} tone="lilac" />
      </div>
      <Card pad={false}>
        <Table head={["Employee", "Months scored", ...kpis.map((k) => k.name), "Days", "Late", "Attendance", "Training", "Overall"]}>
          {rows.map(({ e, p }) => (
            <tr key={e.id}>
              <td><Link href={`/staff/${e.id}`} className="font-bold hover:text-navy hover:underline">{e.name}</Link><div className="text-xs text-muted">{e.designation}</div></td>
              <td className="tabular">{p.months}</td>
              {kpis.map((k) => <td key={k.id}><ScoreBadge value={p.kpi[k.id]} /></td>)}
              <td className="tabular">{p.attendance.days}</td>
              <td className="tabular">{p.attendance.late || <span className="text-muted">0</span>}</td>
              <td><ScoreBadge value={p.attendance.score} /></td>
              <td className="tabular text-xs">{p.trainings.length ? `${p.trainings.length} · ${p.trainingHours} h` : "—"}</td>
              <td><ScoreBadge value={p.overall} className="text-sm" /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function KpiSetup() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [kpis, setKpis] = useState<Kpi[]>(() => settings.kpis ?? []);
  const [attW, setAttW] = useState(attendanceWeight(settings));
  const changed = JSON.stringify(kpis) !== JSON.stringify(settings.kpis ?? []) || attW !== attendanceWeight(settings);
  const set = (id: string, p: Partial<Kpi>) => setKpis(kpis.map((k) => (k.id === id ? { ...k, ...p } : k)));
  const saveAll = async () => {
    const clean = kpis.map((k) => ({ ...k, name: k.name.trim(), description: k.description?.trim() || undefined })).filter((k) => k.name);
    if (await setSettings({ kpis: clean, attendanceWeight: attW }, `KPIs: ${clean.filter((k) => k.active).map((k) => k.name).join(", ") || "none"}; attendance weight ${attW}`)) {
      setKpis(clean);
      toast("KPIs saved");
    }
  };
  return (
    <Card
      title="KPIs staff are scored on"
      action={
        <div className="flex gap-2">
          {!kpis.length && <Button size="sm" variant="secondary" onClick={() => setKpis(SUGGESTED_KPIS.map((k) => ({ ...k, id: uid("kpi") })))}>Add suggested KPIs</Button>}
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setKpis([...kpis, { id: uid("kpi"), name: "", weight: 1, active: true }])}>Add KPI</Button>
        </div>
      }
    >
      <div className="space-y-2">
        {kpis.map((k) => (
          <div key={k.id} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1.2fr_2fr_90px_auto_auto]">
            <Field label="KPI"><Input value={k.name} placeholder="e.g. Customer service" onChange={(e) => set(k.id, { name: e.target.value })} /></Field>
            <Field label="What it means (optional)"><Input value={k.description ?? ""} onChange={(e) => set(k.id, { description: e.target.value })} /></Field>
            <Field label="Weight"><Input type="number" min={0} max={100} value={k.weight} onChange={(e) => set(k.id, { weight: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <div className="pb-2"><Toggle checked={k.active} onChange={(v) => set(k.id, { active: v })} label="In use" /></div>
            <button title="Remove" onClick={() => setKpis(kpis.filter((x) => x.id !== k.id))} className="mb-1.5 rounded-lg p-2 text-muted hover:bg-rose-soft hover:text-[#c24f69]"><Trash2 size={15} /></button>
          </div>
        ))}
        {!kpis.length && <p className="py-4 text-center text-sm text-muted">No KPIs yet. Add your own, or start from the suggested ones and edit them.</p>}
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-4 rounded-xl bg-[#faf7f1] p-4">
        <Field label="Attendance weight" hint="0 = leave attendance out of the overall score"><Input type="number" min={0} max={100} className="w-28" value={attW} onChange={(e) => setAttW(Math.max(0, Number(e.target.value) || 0))} /></Field>
        <p className="min-w-[240px] flex-1 text-xs text-muted">
          Attendance is scored automatically from arrivals (on time or early ÷ all clock-ins measured against working hours, out of 10) and is part of the overall score with this weight.
          A KPI with weight 2 counts twice as much as one with weight 1. Switching a KPI off keeps its old marks but leaves it out of scores and reports.
        </p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button disabled={!changed} onClick={saveAll}>Save KPIs</Button>
      </div>
    </Card>
  );
}
