"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { activeKpis, attendanceStats, evaluationId, fmtScore, scoreTone } from "@/lib/performance";
import type { Employee, Evaluation, Qualification, Training } from "@/lib/types";
import { cx, today, uid } from "@/lib/utils";
import { Badge, Button, Field, Input, Modal, Textarea, toast } from "./ui";

export function ScoreBadge({ value, className }: { value: number | undefined; className?: string }) {
  if (value === undefined) return <span className={cx("text-xs text-muted", className)}>—</span>;
  return <Badge tone={scoreTone(value)} className={className}>{fmtScore(value)}</Badge>;
}

const monthLabel = (m: string) => format(new Date(m + "-01"), "MMMM yyyy");

/** Mark one employee 0–10 on each KPI for a month; their attendance that month is shown alongside. */
export function EvaluateModal({ employee, period, onClose }: { employee: Employee; period: string; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const attendance = useStore((s) => s.attendance);
  const existing = useStore((s) => s.evaluations.find((e) => e.id === evaluationId(employee.id, period)));
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const kpis = activeKpis(settings);
  const [scores, setScores] = useState<Record<string, number>>(() => ({ ...(existing?.scores ?? {}) }));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const att = attendanceStats(attendance, employee.id, period, period);
  const missing = kpis.filter((k) => scores[k.id] === undefined).length;

  const submit = async () => {
    const ev: Evaluation = { id: evaluationId(employee.id, period), employeeId: employee.id, period, scores, notes: notes.trim(), evaluatedBy: "", at: new Date().toISOString() };
    if (await save("evaluations", ev, "Performance", `Scored ${employee.name} for ${monthLabel(period)}`)) {
      toast("Marks saved");
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${employee.name} — ${monthLabel(period)}`}
      width="max-w-2xl"
      footer={
        <>
          {existing && (
            <Button variant="ghost" className="mr-auto text-[#c24f69]" onClick={async () => { if (confirm("Delete these marks?") && (await remove("evaluations", existing.id, "Performance", `Deleted marks for ${employee.name}, ${monthLabel(period)}`))) onClose(); }}>
              Delete marks
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!kpis.length} onClick={submit}>{missing && kpis.length ? `Save (${missing} not marked)` : "Save marks"}</Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-[#faf7f1] p-3 text-center text-xs sm:grid-cols-5">
        <div><div className="text-muted">Days present</div><div className="font-bold tabular">{att.days}</div></div>
        <div><div className="text-muted">Hours</div><div className="font-bold tabular">{att.hours.toFixed(1)}</div></div>
        <div><div className="text-muted">On time / early</div><div className="font-bold tabular text-[#2f8f72]">{att.onTime + att.early}</div></div>
        <div><div className="text-muted">Late</div><div className="font-bold tabular text-[#c24f69]">{att.late}{att.lateMinutes ? ` (${att.lateMinutes} min)` : ""}</div></div>
        <div><div className="text-muted">Attendance score</div><div className="mt-0.5"><ScoreBadge value={att.score} /></div></div>
      </div>
      {!kpis.length && <p className="text-sm text-muted">No KPIs yet — add them on the KPIs tab first.</p>}
      <div className="space-y-4">
        {kpis.map((k) => (
          <div key={k.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <div>
                <span className="text-sm font-bold">{k.name}</span>
                {k.description && <span className="ml-2 text-xs text-muted">{k.description}</span>}
              </div>
              <ScoreBadge value={scores[k.id]} />
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScores({ ...scores, [k.id]: n })}
                  className={cx(
                    "h-8 w-9 rounded-lg border text-sm font-bold tabular transition",
                    scores[k.id] === n ? "border-navy bg-navy text-white" : "border-line bg-white text-ink/70 hover:bg-[#f6f2eb]",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {kpis.length > 0 && (
        <Field label="Notes (optional)" className="mt-5">
          <Textarea rows={3} value={notes} placeholder="Strengths, what to improve, agreed actions…" onChange={(e) => setNotes(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

/** Add or edit a training session and tick who attended. */
export function TrainingModal({ training, presetEmployeeId, onClose }: { training?: Training; presetEmployeeId?: string; onClose: () => void }) {
  const employees = useStore((s) => s.employees);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const [t, setT] = useState<Training>(
    () => training ?? { id: uid("tr"), title: "", date: today(), trainer: "", hours: 2, description: "", employeeIds: presetEmployeeId ? [presetEmployeeId] : [] },
  );
  const toggle = (id: string) => setT({ ...t, employeeIds: t.employeeIds.includes(id) ? t.employeeIds.filter((x) => x !== id) : [...t.employeeIds, id] });
  const list = employees.filter((e) => e.active || t.employeeIds.includes(e.id));
  const submit = async () => {
    if (!t.title.trim()) return toast("Enter what the training was", "err");
    if (!t.employeeIds.length) return toast("Tick who attended", "err");
    if (await save("trainings", { ...t, title: t.title.trim(), trainer: t.trainer.trim(), description: t.description.trim() }, "HR", `${training ? "Updated" : "Recorded"} training “${t.title.trim()}” (${t.employeeIds.length} staff)`)) {
      toast("Training saved");
      onClose();
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={training ? "Edit training" : "Record training"}
      width="max-w-2xl"
      footer={
        <>
          {training && (
            <Button variant="ghost" className="mr-auto text-[#c24f69]" onClick={async () => { if (confirm(`Delete “${training.title}”?`) && (await remove("trainings", training.id, "HR", `Deleted training “${training.title}”`))) onClose(); }}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Training" className="sm:col-span-3"><Input autoFocus value={t.title} placeholder="e.g. First aid for children" onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} /></Field>
        <Field label="Trainer / provider"><Input value={t.trainer} placeholder="e.g. Red Cross" onChange={(e) => setT({ ...t, trainer: e.target.value })} /></Field>
        <Field label="Hours"><Input type="number" min={0} step={0.5} value={t.hours} onChange={(e) => setT({ ...t, hours: Math.max(0, Number(e.target.value) || 0) })} /></Field>
        <Field label="What was covered (optional)" className="sm:col-span-3"><Textarea rows={2} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-bold text-ink/80">Attended ({t.employeeIds.length})</span>
          <button type="button" className="text-xs font-bold text-navy hover:underline" onClick={() => setT({ ...t, employeeIds: t.employeeIds.length === list.length ? [] : list.map((e) => e.id) })}>
            {t.employeeIds.length === list.length ? "Clear" : "Everyone"}
          </button>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {list.map((e) => (
            <label key={e.id} className={cx("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm", t.employeeIds.includes(e.id) ? "border-navy bg-sky-soft" : "border-line bg-white")}>
              <input type="checkbox" checked={t.employeeIds.includes(e.id)} onChange={() => toggle(e.id)} />
              <span className="font-bold">{e.name}</span>
              <span className="text-xs text-muted">{e.designation}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Add or edit one qualification on an employee's record. */
export function QualificationModal({ employee, qualification, onClose }: { employee: Employee; qualification?: Qualification; onClose: () => void }) {
  const save = useStore((s) => s.save);
  const [q, setQ] = useState<Qualification>(() => qualification ?? { id: uid("q"), title: "", institution: "", year: "" });
  const submit = async () => {
    if (!q.title.trim()) return toast("Enter the qualification", "err");
    const clean = { ...q, title: q.title.trim(), institution: q.institution.trim(), year: q.year.trim(), notes: q.notes?.trim() || undefined };
    const list = employee.qualifications ?? [];
    const qualifications = list.some((x) => x.id === q.id) ? list.map((x) => (x.id === q.id ? clean : x)) : [...list, clean];
    if (await save("employees", { ...employee, qualifications }, "HR", `${qualification ? "Updated" : "Added"} qualification “${clean.title}” for ${employee.name}`)) {
      toast("Qualification saved");
      onClose();
    }
  };
  return (
    <Modal open onClose={onClose} title={qualification ? "Edit qualification" : "Add qualification"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Qualification" className="sm:col-span-3"><Input autoFocus value={q.title} placeholder="e.g. Diploma in Early Childhood Education" onChange={(e) => setQ({ ...q, title: e.target.value })} /></Field>
        <Field label="Institution" className="sm:col-span-2"><Input value={q.institution} onChange={(e) => setQ({ ...q, institution: e.target.value })} /></Field>
        <Field label="Year"><Input value={q.year} placeholder="2024" onChange={(e) => setQ({ ...q, year: e.target.value })} /></Field>
        <Field label="Notes (optional)" className="sm:col-span-3"><Input value={q.notes ?? ""} placeholder="Grade, licence number, expiry…" onChange={(e) => setQ({ ...q, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
