"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Star } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { ageOf, fmtDate, money, downloadCSV } from "@/lib/utils";
import { Button, Card, Input, Modal, NoAccess, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { NewCustomer } from "@/components/CustomerPicker";
import { useRouter } from "next/navigation";

export default function CustomersPage() {
  const can = useCan();
  if (!can("customers.view")) return <NoAccess what="customer profiles" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const router = useRouter();
  const customers = useStore((s) => s.customers);
  const children = useStore((s) => s.children);
  const tickets = useStore((s) => s.tickets);
  const tx = useStore((s) => s.transactions);
  const bookings = useStore((s) => s.bookings);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "members" | "wallet" | "party">("all");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const visits = new Map<string, { n: number; last: string }>();
    tickets.forEach((t) => {
      if (t.status === "cancelled") return;
      const v = visits.get(t.customerId) ?? { n: 0, last: "" };
      v.n++;
      if (t.checkIn > v.last) v.last = t.checkIn;
      visits.set(t.customerId, v);
    });
    const spend = new Map<string, number>();
    tx.forEach((t) => t.customerId && t.type !== "topup" && spend.set(t.customerId, (spend.get(t.customerId) ?? 0) + t.amount));
    const party = new Set(bookings.filter((b) => b.kind === "party").map((b) => b.customerId));
    const s = q.trim().toLowerCase();
    return customers
      .map((c) => ({ c, kids: children.filter((k) => k.guardianId === c.id), visits: visits.get(c.id), spend: spend.get(c.id) ?? 0, party: party.has(c.id) }))
      .filter((r) => !s || r.c.name.toLowerCase().includes(s) || r.c.phone.includes(s) || r.kids.some((k) => k.name.toLowerCase().includes(s)))
      .filter((r) => f === "all" || (f === "members" && r.c.member) || (f === "wallet" && r.c.wallet > 0) || (f === "party" && r.party))
      .sort((a, b) => (b.visits?.last ?? "").localeCompare(a.visits?.last ?? ""));
  }, [customers, children, tickets, tx, bookings, q, f]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Families, their children, visits, payments, parties and wallet balances."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCSV("customers.csv", [["Name", "Phone", "Email", "Member", "Children", "Visits", "Spend", "Points", "Wallet"], ...rows.map((r) => [r.c.name, r.c.phone, r.c.email, r.c.member ? "Yes" : "No", r.kids.length, r.visits?.n ?? 0, r.spend, r.c.points, r.c.wallet])])}>Export</Button>
            {can("customers.edit") && <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>New family</Button>}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Families" value={customers.length} tone="sky" />
        <Stat label="Children on file" value={children.length} tone="mint" />
        <Stat label="Members" value={customers.filter((c) => c.member).length} tone="sun" />
        <Stat label="Wallet balances held" value={money(customers.reduce((a, c) => a + c.wallet, 0))} sub="Owed to customers (liability)" tone="lilac" />
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Tabs value={f} onChange={setF} items={[{ value: "all", label: "All" }, { value: "members", label: "Members" }, { value: "wallet", label: "Has wallet" }, { value: "party", label: "Party customers" }]} />
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search guardian, phone or child" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card pad={false}>
        <Table head={["Guardian", "Children", "Visits", "Last visit", "Total spent", "Points", "Wallet"]}>
          {rows.map(({ c, kids, visits, spend }) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
              <td>
                <Link href={`/customers/${c.id}`} className="font-bold hover:text-navy">{c.name}</Link>
                {c.member && <Star size={12} className="ml-1.5 inline text-[#e0b13a]" fill="currentColor" />}
                <div className="text-xs text-muted">{c.phone}</div>
              </td>
              <td className="text-muted">{kids.map((k) => `${k.name.split(" ")[0]} (${ageOf(k.dob)})`).join(", ")}</td>
              <td className="tabular">{visits?.n ?? 0}</td>
              <td className="tabular text-muted">{visits ? fmtDate(visits.last) : "—"}</td>
              <td className="tabular">{money(spend)}</td>
              <td className="tabular">{c.points}</td>
              <td className="tabular">{c.wallet ? money(c.wallet) : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="New family" width="max-w-2xl">
        <NewCustomer onCancel={() => setAdding(false)} onDone={(id) => router.push(`/customers/${id}`)} />
      </Modal>
    </>
  );
}
