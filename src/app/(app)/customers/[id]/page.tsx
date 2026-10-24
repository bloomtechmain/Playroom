"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Cake, Pencil, Plus, Star } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { Child, Customer, PayMethod } from "@/lib/types";
import { ageOf, cx, fmtDate, fmtDT, methodLabel, minsToLabel, money, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, Select, Stat, Table, Tabs, Textarea, Toggle, toast } from "@/components/ui";
import { PaymentPicker } from "@/components/Payment";
import { useNow } from "@/lib/hooks";

export default function CustomerProfile() {
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const c = useStore((s) => s.customers.find((x) => x.id === id));
  if (!can("customers.view")) return <NoAccess what="customer profiles" />;
  if (!c) return <p className="text-muted">Customer not found.</p>;
  return <Profile c={c} />;
}

function Profile({ c }: { c: Customer }) {
  const can = useCan();
  const children = useStore((s) => s.children);
  const tickets = useStore((s) => s.tickets);
  const tx = useStore((s) => s.transactions);
  const bookings = useStore((s) => s.bookings);
  const zones = useStore((s) => s.zones);
  const packages = useStore((s) => s.packages);
  const save = useStore((s) => s.save);
  const topUp = useStore((s) => s.topUpWallet);
  const [tab, setTab] = useState<"visits" | "payments" | "parties">("visits");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(c);
  const [kid, setKid] = useState<Child | null>(null);
  const [wallet, setWallet] = useState(false);
  const [amt, setAmt] = useState("5000");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [pointsAdj, setPointsAdj] = useState("");

  const now = useNow(60000);
  const kids = children.filter((k) => k.guardianId === c.id);
  const visits = useMemo(() => tickets.filter((t) => t.customerId === c.id).sort((a, b) => b.checkIn.localeCompare(a.checkIn)), [tickets, c.id]);
  const pays = useMemo(() => tx.filter((t) => t.customerId === c.id).sort((a, b) => b.at.localeCompare(a.at)), [tx, c.id]);
  const parties = bookings.filter((b) => b.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const spend = pays.filter((p) => p.type !== "topup").reduce((a, p) => a + p.amount, 0);

  return (
    <>
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
        <ArrowLeft size={16} /> Customers
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-semibold text-navy">
            {c.name}
            {c.member && <Badge tone="sun"><Star size={11} fill="currentColor" /> Member</Badge>}
          </h1>
          <p className="text-sm text-muted">{c.phone} · {c.email || "no email"} · {c.address || "—"} · customer since {fmtDate(c.createdAt, "MMM yyyy")}</p>
          {c.notes && <p className="mt-1 text-sm text-ink/70">“{c.notes}”</p>}
        </div>
        {can("customers.edit") && <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => { setForm(c); setEditing(true); }}>Edit profile</Button>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Visits" value={visits.filter((v) => v.status !== "cancelled").length} sub={visits[0] ? `Last ${fmtDate(visits[0].checkIn)}` : "No visits yet"} tone="sky" />
        <Stat label="Lifetime spend" value={money(spend)} tone="mint" />
        <Stat
          label="Loyalty points"
          value={c.points}
          sub={can("wallet.adjust") ? (
            <span className="flex items-center gap-1">
              <Input className="h-7 w-20 text-xs" placeholder="±pts" value={pointsAdj} onChange={(e) => setPointsAdj(e.target.value)} />
              <button className="font-bold text-navy" onClick={() => { const n = Number(pointsAdj); if (!n) return; save("customers", { ...c, points: Math.max(0, c.points + n) }, "Customers", `Points adjusted ${n > 0 ? "+" : ""}${n} for ${c.name}`); setPointsAdj(""); }}>Adjust</button>
            </span>
          ) : `Worth ${money(c.points)}`}
          tone="sun"
        />
        <Stat label="Wallet balance" value={money(c.wallet)} sub={can("wallet.adjust") ? <button className="font-bold text-navy" onClick={() => setWallet(true)}>Top up →</button> : undefined} tone="lilac" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card title="Children" action={can("customers.edit") && <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setKid({ id: "", guardianId: c.id, name: "", dob: "", gender: "girl", allergies: "" })}>Add</Button>} pad={false}>
          {kids.map((k) => {
            const kv = tickets.filter((t) => t.childIds.includes(k.id) && t.status !== "cancelled");
            const bday = new Date(k.dob);
            const next = new Date(new Date().getFullYear(), bday.getMonth(), bday.getDate());
            const soon = (next.getTime() - now.getTime()) / 864e5;
            return (
              <div key={k.id} className="border-b border-[#f2eee6] px-5 py-3.5 last:border-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold">{k.name}</div>
                    <div className="text-xs text-muted">{ageOf(k.dob)} years · born {fmtDate(k.dob)} · {k.gender}</div>
                  </div>
                  {can("customers.edit") && <button onClick={() => setKid(k)} className="text-muted hover:text-navy"><Pencil size={14} /></button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="sky">{kv.length} visits</Badge>
                  {kv[0] && <Badge tone="gray">last {fmtDate(kv.reduce((m, t) => (t.checkIn > m ? t.checkIn : m), kv[0].checkIn), "d MMM")}</Badge>}
                  {k.allergies && <Badge tone="rose">Allergy: {k.allergies}</Badge>}
                  {soon >= 0 && soon <= 45 && <Badge tone="lilac"><Cake size={11} /> Birthday in {Math.ceil(soon)} days</Badge>}
                </div>
              </div>
            );
          })}
          {kids.length === 0 && <p className="p-5 text-sm text-muted">No children linked yet.</p>}
        </Card>

        <Card pad={false} title={<Tabs value={tab} onChange={setTab} items={[{ value: "visits", label: `Visit log (${visits.length})` }, { value: "payments", label: `Payments (${pays.length})` }, { value: "parties", label: `Parties & bookings (${parties.length})` }]} />}>
          {tab === "visits" && (
            <Table head={["Ticket", "Date", "Zone", "Children", "Stay", "Paid", "Status"]}>
              {visits.slice(0, 60).map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs font-bold">{t.code}</td>
                  <td className="tabular">{fmtDT(t.checkIn)}</td>
                  <td className="text-muted">{zones.find((z) => z.id === t.zoneId)?.name}</td>
                  <td>{children.filter((k) => t.childIds.includes(k.id)).map((k) => k.name.split(" ")[0]).join(", ") || `${t.visitors} person(s)`}</td>
                  <td className="tabular text-muted">{t.checkOut ? minsToLabel((new Date(t.checkOut).getTime() - new Date(t.checkIn).getTime()) / 60000) : "—"}</td>
                  <td className="tabular">{money(t.paid)}</td>
                  <td><Badge tone={t.status === "active" ? "mint" : t.status === "completed" ? "sky" : t.status === "refunded" ? "rose" : "gray"}><span className="capitalize">{t.status}</span></Badge></td>
                </tr>
              ))}
            </Table>
          )}
          {tab === "payments" && (
            <Table head={["Date", "For", "Reference", "Method", "Amount"]}>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td className="tabular">{fmtDT(p.at)}</td>
                  <td className="capitalize">{p.type === "pos" ? "Café / shop" : p.type === "topup" ? "Wallet top-up" : p.type}</td>
                  <td className="font-mono text-xs">{p.refLabel}</td>
                  <td className="text-muted">{methodLabel[p.method]}</td>
                  <td className={cx("tabular font-bold", p.amount < 0 && "text-[#c24f69]")}>{money(p.amount)}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === "parties" && (
            <Table head={["Ref", "Date", "Type", "Package", "Guests", "Total", "Balance", "Status"]}>
              {parties.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono text-xs font-bold">{b.ref}</td>
                  <td className="tabular">{b.date} {b.start}</td>
                  <td>{b.kind === "party" ? (b.mode === "full" ? "Full venue" : "Party room") : "Play"}</td>
                  <td>{packages.find((p) => p.id === b.packageId)?.name ?? "—"}</td>
                  <td className="tabular">{b.guests}</td>
                  <td className="tabular">{money(b.total)}</td>
                  <td className="tabular">{money(b.total - b.paid)}</td>
                  <td><Badge tone={b.status === "confirmed" ? "mint" : b.status === "completed" ? "sky" : b.status === "pending" ? "sun" : "gray"}><span className="capitalize">{b.status}</span></Badge></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit profile" width="max-w-xl" footer={<><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={() => { save("customers", form, "Customers", `Profile ${form.name}`); setEditing(false); toast("Saved"); }}>Save</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Area / address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Toggle checked={form.member} onChange={(v) => setForm({ ...form, member: v })} label="Playroom member" />
          <Toggle checked={!form.whatsappOptOut} onChange={(v) => setForm({ ...form, whatsappOptOut: !v })} label="WhatsApp promotions & birthday wishes" />
        </div>
      </Modal>

      {kid && (
        <Modal open onClose={() => setKid(null)} title={kid.id ? `Edit ${kid.name}` : "Add child"} footer={<><Button variant="secondary" onClick={() => setKid(null)}>Cancel</Button><Button onClick={() => { if (!kid.name || !kid.dob) return toast("Name and birth date required", "err"); const item = kid.id ? kid : { ...kid, id: uid("k") }; save("children", item, "Customers", `Child ${item.name} (${c.name})`); setKid(null); }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={kid.name} onChange={(e) => setKid({ ...kid, name: e.target.value })} /></Field>
            <Field label="Date of birth"><Input type="date" value={kid.dob} onChange={(e) => setKid({ ...kid, dob: e.target.value })} /></Field>
            <Field label="Gender"><Select value={kid.gender} onChange={(e) => setKid({ ...kid, gender: e.target.value as Child["gender"] })}><option value="girl">Girl</option><option value="boy">Boy</option><option value="other">Other</option></Select></Field>
            <Field label="Allergies / medical notes"><Input value={kid.allergies} onChange={(e) => setKid({ ...kid, allergies: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      <Modal open={wallet} onClose={() => setWallet(false)} title="Top up wallet" footer={<><Button variant="secondary" onClick={() => setWallet(false)}>Cancel</Button><Button onClick={async () => { const n = Number(amt); if (n <= 0) return; if (!(await topUp(c.id, n, method))) return; setWallet(false); toast(`Wallet topped up ${money(n)}`); }}>Top up {money(Number(amt) || 0)}</Button></>}>
        <Field label="Amount (Rs.)"><Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <div className="mt-4"><PaymentPicker method={method} onMethod={setMethod} total={Number(amt) || 0} hide={["wallet"]} /></div>
        <p className="mt-3 text-xs text-muted">Wallet money is held as a customer balance — it becomes revenue when it&apos;s spent on play, parties or the café.</p>
      </Modal>
    </>
  );
}
