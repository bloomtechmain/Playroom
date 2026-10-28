"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { Training } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { Badge, Button, Card, Input, NoAccess, PageHeader, Stat, Table } from "@/components/ui";
import { TrainingModal } from "@/components/StaffDevelopment";

export default function TrainingPage() {
  const can = useCan();
  if (!can("hr.view")) return <NoAccess what="staff training" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const trainings = useStore((s) => s.trainings);
  const employees = useStore((s) => s.employees);
  const [edit, setEdit] = useState<Training | "new" | null>(null);
  const [q, setQ] = useState("");
  const year = String(new Date().getFullYear());
  const list = [...trainings]
    .filter((t) => !q || `${t.title} ${t.trainer} ${t.description}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));
  const thisYear = trainings.filter((t) => t.date.startsWith(year));
  const trained = new Set(thisYear.flatMap((t) => t.employeeIds));
  const name = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Training"
        subtitle="Training the company runs or pays for, and who attended. Each session shows on the attendees' staff profiles."
        actions={can("hr.edit") && <Button icon={<Plus size={16} />} onClick={() => setEdit("new")}>Record training</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Sessions in ${year}`} value={thisYear.length} tone="sky" />
        <Stat label="Training hours" value={thisYear.reduce((a, t) => a + t.hours, 0)} sub="session hours" tone="lilac" />
        <Stat label="Staff trained" value={trained.size} sub={`of ${employees.filter((e) => e.active).length} active`} tone="mint" />
        <Stat label="Person-hours" value={thisYear.reduce((a, t) => a + t.hours * t.employeeIds.length, 0)} sub="hours × attendees" tone="sun" />
      </div>
      <div className="mb-4"><Input className="max-w-sm" placeholder="Search training…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Card pad={false}>
        <Table head={["Date", "Training", "Trainer", "Hours", "Attended", ""]}>
          {list.map((t) => (
            <tr key={t.id}>
              <td className="tabular whitespace-nowrap">{fmtDate(t.date)}</td>
              <td><div className="font-bold">{t.title}</div>{t.description && <div className="line-clamp-2 max-w-md text-xs text-muted">{t.description}</div>}</td>
              <td>{t.trainer || "—"}</td>
              <td className="tabular">{t.hours}</td>
              <td>
                <div className="flex max-w-md flex-wrap gap-1">
                  {t.employeeIds.map((id) => (
                    <Link key={id} href={`/staff/${id}`}><Badge tone="sky">{name(id)}</Badge></Link>
                  ))}
                </div>
              </td>
              <td className="text-right">{can("hr.edit") && <button onClick={() => setEdit(t)} className="text-xs font-bold text-navy hover:underline">Edit</button>}</td>
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-sm text-muted">{q ? "No training matches." : "No training recorded yet."}</td>
            </tr>
          )}
        </Table>
      </Card>
      {edit && <TrainingModal training={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
