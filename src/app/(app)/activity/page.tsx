"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { downloadCSV, fmtDT } from "@/lib/utils";
import { localDay } from "@/lib/accounting";
import { Button, Card, Input, NoAccess, PageHeader, Select, Stat, Table } from "@/components/ui";
import { Avatar } from "@/components/Shell";

export default function ActivityPage() {
  const can = useCan();
  if (!can("activity.view")) return <NoAccess what="the activity log" />;
  return <Inner />;
}

function Inner() {
  const activity = useStore((s) => s.activity);
  const users = useStore((s) => s.users);
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("all");
  const [user, setUser] = useState("all");
  const [limit, setLimit] = useState(100);
  const modules = Array.from(new Set(activity.map((a) => a.module))).sort();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...activity]
      .sort((a, b) => b.at.localeCompare(a.at))
      .filter((a) => (mod === "all" || a.module === mod) && (user === "all" || a.userId === user) && (!s || `${a.action} ${a.detail} ${a.after ?? ""}`.toLowerCase().includes(s)));
  }, [activity, q, mod, user]);
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "System";
  const todayCount = activity.filter((a) => localDay(a.at) === localDay(new Date().toISOString())).length;
  const activeUsers = new Set(activity.filter((a) => localDay(a.at) === localDay(new Date().toISOString())).map((a) => a.userId)).size;

  return (
    <>
      <PageHeader
        title="Activity Log"
        subtitle="Every change made in the system — who, what and when. Records can't be edited or deleted."
        actions={<Button variant="secondary" onClick={() => downloadCSV("audit-trail.csv", [["Time", "User", "Module", "Action", "Detail", "Changes"], ...list.map((a) => [a.at, name(a.userId), a.module, a.action, a.detail, a.after ?? ""])])}>Export audit trail</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Events today" value={todayCount} tone="sky" />
        <Stat label="Users active today" value={activeUsers} tone="mint" />
        <Stat label="Refund decisions" value={activity.filter((a) => a.module === "Refunds" && a.action !== "Requested refund").length} tone="rose" />
        <Stat label="Price / permission changes" value={activity.filter((a) => ["Pricing", "Roles", "Promotions"].includes(a.module)).length} tone="sun" />
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-48" value={mod} onChange={(e) => setMod(e.target.value)}><option value="all">All modules</option>{modules.map((m) => <option key={m}>{m}</option>)}</Select>
        <Select className="w-56" value={user} onChange={(e) => setUser(e.target.value)}><option value="all">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
      </div>
      <Card pad={false}>
        <Table head={["When", "User", "Module", "Action", "Details"]}>
          {list.slice(0, limit).map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap tabular text-muted">{fmtDT(a.at)}</td>
              <td><span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={name(a.userId)} size={24} />{name(a.userId)}</span></td>
              <td><span className="rounded-md bg-[#f3efe8] px-2 py-0.5 text-xs font-bold">{a.module}</span></td>
              <td className="whitespace-nowrap font-bold">{a.action}</td>
              <td>
                {a.detail}
                {a.after && <div className="mt-0.5 font-mono text-[11px] text-muted">{a.after}</div>}
              </td>
            </tr>
          ))}
        </Table>
        {list.length > limit && <div className="border-t border-line p-3 text-center"><Button variant="ghost" onClick={() => setLimit(limit + 200)}>Show more</Button></div>}
      </Card>
    </>
  );
}
