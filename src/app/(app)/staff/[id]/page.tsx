"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { format, subMonths } from "date-fns";
import { ArrowLeft, CalendarClock, GraduationCap, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { EMPLOYMENT, employmentOf, payLabel } from "@/lib/payroll";
import { hoursLabel } from "@/lib/punctuality";
import { activeKpis, attendanceStats, evaluationAverage, evaluationId, performanceOf } from "@/lib/performance";
import type { Employee, Qualification, Training } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { Badge, Button, Card, NoAccess, Stat, Table, toast } from "@/components/ui";
import { Avatar } from "@/components/Shell";
import { AttendanceRecord } from "@/components/Arrival";
import { EvaluateModal, QualificationModal, ScoreBadge, TrainingModal } from "@/components/StaffDevelopment";

export default function StaffProfile() {
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const e = useStore((s) => s.employees.find((x) => x.id === id));
  if (!can("hr.view")) return <NoAccess what="staff records" />;
  if (!e) return <p className="text-muted">Employee not found.</p>;
  return <Profile e={e} />;
}

const thisMonth = () => format(new Date(), "yyyy-MM");

function Profile({ e }: { e: Employee }) {
  const can = useCan();
  const settings = useStore((s) => s.settings);
  const attendance = useStore((s) => s.attendance);
  const trainings = useStore((s) => s.trainings);
  const evaluations = useStore((s) => s.evaluations);
  const save = useStore((s) => s.save);
  const [qual, setQual] = useState<Qualification | "new" | null>(null);
  const [training, setTraining] = useState<Training | "new" | null>(null);
  const [evaluate, setEvaluate] = useState<string | null>(null);
  const [record, setRecord] = useState(false);
  const canEdit = can("hr.edit");
  const canEval = can("hr.evaluate");

  const mine = trainings.filter((t) => t.employeeIds.includes(e.id)).sort((a, b) => b.date.localeCompare(a.date));
  const month = thisMonth();
  const att = attendanceStats(attendance, e.id, month, month);
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), "yyyy-MM"));
  const kpis = activeKpis(settings);
  const year = performanceOf(e.id, { evaluations, attendance, trainings, settings }, months[5], months[0]);
  const qualifications = e.qualifications ?? [];

  const removeQual = async (q: Qualification) => {
    if (!confirm(`Remove “${q.title}”?`)) return;
    if (await save("employees", { ...e, qualifications: qualifications.filter((x) => x.id !== q.id) }, "HR", `Removed qualification “${q.title}” for ${e.name}`)) toast("Removed");
  };

  return (
    <>
      <Link href="/staff" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
        <ArrowLeft size={16} /> Staff
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={e.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-[28px] font-semibold text-navy">
            {e.name}
            <Badge tone={EMPLOYMENT[employmentOf(e)].tone}>{EMPLOYMENT[employmentOf(e)].label}</Badge>
            {!e.active && <Badge tone="gray">Inactive</Badge>}
          </h1>
          <p className="text-sm text-muted">
            {e.designation || "—"} · {e.code} · joined {fmtDate(e.joinDate)}{e.phone && ` · ${e.phone}`}{e.nic && ` · NIC ${e.nic}`}
          </p>
          <p className="text-sm text-muted">
            {payLabel(e)}
            {e.workHours && ` · works ${hoursLabel(e.workHours)}`}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Days present this month" value={att.days} sub={`${att.hours.toFixed(1)} hours`} tone="sky" />
        <Stat label="Late this month" value={att.late} sub={att.score !== undefined ? `${att.onTime + att.early} on time or early` : "No working hours set"} tone="rose" />
        <Stat label="Training (6 months)" value={year.trainings.length} sub={`${year.trainingHours} hours`} tone="lilac" />
        {canEval ? (
          <Stat label="Performance (6 months)" value={<ScoreBadge value={year.overall} className="text-base" />} sub={`${year.months} month${year.months === 1 ? "" : "s"} scored`} tone="mint" />
        ) : (
          <Stat label="Qualifications" value={qualifications.length} tone="mint" />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><GraduationCap size={17} /> Qualifications</span>} action={canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setQual("new")}>Add</Button>} pad={false}>
          {qualifications.length ? (
            <Table head={["Qualification", "Institution", "Year", ""]}>
              {qualifications.map((q) => (
                <tr key={q.id}>
                  <td><div className="font-bold">{q.title}</div>{q.notes && <div className="text-xs text-muted">{q.notes}</div>}</td>
                  <td>{q.institution || "—"}</td>
                  <td className="tabular">{q.year || "—"}</td>
                  <td className="text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button title="Edit" onClick={() => setQual(q)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={14} /></button>
                        <button title="Remove" onClick={() => removeQual(q)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-[#c24f69]"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-muted">No qualifications recorded.</p>
          )}
        </Card>

        <Card title="Training by the company" action={canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setTraining("new")}>Record training</Button>} pad={false}>
          {mine.length ? (
            <Table head={["Date", "Training", "Trainer", "Hours"]}>
              {mine.map((t) => (
                <tr key={t.id} className={canEdit ? "cursor-pointer hover:bg-[#faf7f1]" : undefined} onClick={() => canEdit && setTraining(t)}>
                  <td className="tabular">{fmtDate(t.date)}</td>
                  <td><div className="font-bold">{t.title}</div>{t.description && <div className="line-clamp-1 text-xs text-muted">{t.description}</div>}</td>
                  <td>{t.trainer || "—"}</td>
                  <td className="tabular">{t.hours}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-muted">No training recorded yet.</p>
          )}
        </Card>

        {canEval && (
          <Card title={<span className="flex items-center gap-2"><Star size={17} /> Performance</span>} action={<Button size="sm" onClick={() => setEvaluate(month)}>Score {format(new Date(), "MMMM")}</Button>} pad={false} className="xl:col-span-2">
            {kpis.length ? (
              <Table head={["Month", ...kpis.map((k) => k.name), "KPI average", "Attendance", "Overall", ""]}>
                {months.map((m) => {
                  const ev = evaluations.find((x) => x.id === evaluationId(e.id, m));
                  const p = performanceOf(e.id, { evaluations, attendance, trainings, settings }, m, m);
                  return (
                    <tr key={m}>
                      <td className="whitespace-nowrap">{format(new Date(m + "-01"), "MMM yyyy")}</td>
                      {kpis.map((k) => <td key={k.id}><ScoreBadge value={ev?.scores[k.id]} /></td>)}
                      <td><ScoreBadge value={evaluationAverage(ev, settings)} /></td>
                      <td><ScoreBadge value={p.attendance.score} /></td>
                      <td><ScoreBadge value={ev ? p.overall : undefined} /></td>
                      <td className="text-right"><button onClick={() => setEvaluate(m)} className="text-xs font-bold text-navy hover:underline">{ev ? "Edit" : "Score"}</button></td>
                    </tr>
                  );
                })}
              </Table>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted">
                No KPIs yet — set them up in <Link href="/performance" className="font-bold text-navy hover:underline">Performance</Link>.
              </p>
            )}
          </Card>
        )}

        <Card title={<span className="flex items-center gap-2"><CalendarClock size={17} /> Attendance</span>} action={<Button size="sm" variant="secondary" onClick={() => setRecord(true)}>Full record</Button>} className="xl:col-span-2">
          <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-5">
            <div className="rounded-xl bg-[#faf7f1] py-3"><div className="text-xs text-muted">Days this month</div><div className="font-bold tabular">{att.days}</div></div>
            <div className="rounded-xl bg-[#faf7f1] py-3"><div className="text-xs text-muted">Hours</div><div className="font-bold tabular">{att.hours.toFixed(1)}</div></div>
            <div className="rounded-xl bg-mint-soft py-3"><div className="text-xs text-muted">On time</div><div className="font-bold tabular">{att.onTime}</div></div>
            <div className="rounded-xl bg-sky-soft py-3"><div className="text-xs text-muted">Early</div><div className="font-bold tabular">{att.early}</div></div>
            <div className="rounded-xl bg-rose-soft py-3"><div className="text-xs text-muted">Late</div><div className="font-bold tabular">{att.late}</div></div>
          </div>
          {att.score === undefined && <p className="mt-2 text-xs text-muted">Arrivals are marked once working hours are set for {e.name.split(" ")[0]} (administrators and the owner).</p>}
        </Card>
      </div>

      {qual && <QualificationModal employee={e} qualification={qual === "new" ? undefined : qual} onClose={() => setQual(null)} />}
      {training && <TrainingModal training={training === "new" ? undefined : training} presetEmployeeId={e.id} onClose={() => setTraining(null)} />}
      {evaluate && <EvaluateModal employee={e} period={evaluate} onClose={() => setEvaluate(null)} />}
      {record && <AttendanceRecord employee={e} onClose={() => setRecord(false)} />}
    </>
  );
}
