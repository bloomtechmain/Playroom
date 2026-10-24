"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { REFUND_REASONS, type PayMethod, type RefundRequest } from "@/lib/types";
import { fmtDT, methodLabel, money } from "@/lib/utils";
import { Badge, Button, Card, Empty, Input, Modal, NoAccess, PageHeader, Stat, Table, Tabs, toast } from "@/components/ui";
import RefundDialog from "@/components/RefundDialog";

const reasonLabel = (r: RefundRequest) => REFUND_REASONS.find((x) => x.value === r.category)?.label;

export default function RefundsPage() {
  const can = useCan();
  if (!can("refunds.request") && !can("refunds.approve")) return <NoAccess what="refunds" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const refunds = useStore((s) => s.refunds);
  const users = useStore((s) => s.users);
  const settings = useStore((s) => s.settings);
  const decide = useStore((s) => s.decideRefund);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Refundable | null>(null);
  const pending = refunds.filter((r) => r.status === "pending");
  const history = refunds.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? b.at).localeCompare(a.decidedAt ?? a.at));
  const name = (id?: string) => users.find((u) => u.id === id)?.name ?? "—";
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = history.filter((r) => r.status === "approved" && (r.decidedAt ?? "").startsWith(monthKey));

  return (
    <>
      <PageHeader
        title="Refunds"
        subtitle={settings.refundNeedsApproval ? "Refunds need manager approval before money goes back to the customer." : "Manager approval is currently switched off in Settings."}
        actions={<Button icon={<Plus size={16} />} onClick={() => setPicking(true)}>New refund</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Awaiting approval" value={pending.length} tone="sun" />
        <Stat label="Pending value" value={money(pending.reduce((a, r) => a + r.amount, 0))} tone="rose" />
        <Stat label="Refunded this month" value={money(thisMonth.reduce((a, r) => a + r.amount, 0))} sub={`${thisMonth.length} refunds`} tone="lilac" />
        <Stat label="Rejected (all time)" value={history.filter((r) => r.status === "rejected").length} tone="gray" />
      </div>
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "pending", label: `Pending (${pending.length})` }, { value: "history", label: "History" }]} /></div>
      {tab === "pending" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.length === 0 && <Card className="lg:col-span-2"><Empty title="Nothing waiting" hint="New refund requests from the counter will show up here." /></Card>}
          {pending.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm font-bold">{r.label}</div>
                  <div className="text-xs capitalize text-muted">{r.target} · requested {fmtDT(r.at)} by {name(r.requestedBy)}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-semibold text-[#c24f69] tabular">{money(r.amount)}</div>
                  <div className="text-xs text-muted">{r.full ? "Full" : `Partial of ${money(r.maxAmount)}`} · to {methodLabel[r.method]}</div>
                </div>
              </div>
              {reasonLabel(r) && <Badge tone="lilac" className="mt-3">{reasonLabel(r)}</Badge>}
              <p className="mt-2 rounded-xl bg-[#faf7f1] px-3 py-2 text-sm">“{r.reason}”</p>
              {can("refunds.approve") ? (
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" icon={<X size={15} />} onClick={async () => { if (await decide(r.id, false)) toast("Refund rejected"); }}>Reject</Button>
                  <Button variant="success" icon={<Check size={15} />} onClick={async () => { if (await decide(r.id, true)) toast(`Refund of ${money(r.amount)} approved`); }}>Approve & refund</Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">Waiting for a manager to approve.</p>
              )}
            </Card>
          ))}
        </div>
      )}
      {tab === "history" && (
        <Card pad={false}>
          <Table head={["Reference", "Type", "Amount", "Method", "Reason", "Requested by", "Decision", "By"]}>
            {history.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-xs font-bold">{r.label}</td>
                <td className="capitalize text-muted">{r.target}</td>
                <td className="tabular font-bold">{money(r.amount)}</td>
                <td className="text-muted">{methodLabel[r.method]}</td>
                <td className="max-w-[280px] truncate">{reasonLabel(r) && <span className="font-semibold">{reasonLabel(r)} · </span>}{r.reason}</td>
                <td>{name(r.requestedBy)}</td>
                <td><Badge tone={r.status === "approved" ? "mint" : "rose"}><span className="capitalize">{r.status}</span></Badge></td>
                <td className="text-muted">{name(r.decidedBy)} · {r.decidedAt && fmtDT(r.decidedAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      {picking && <RefundPicker onClose={() => setPicking(false)} onPick={(t) => { setPicking(false); setTarget(t); }} />}
      {target && <RefundDialog open onClose={() => setTarget(null)} target={target.target} targetId={target.id} label={target.label} max={target.paid} method={target.method} />}
    </>
  );
}

interface Refundable {
  target: RefundRequest["target"];
  id: string;
  label: string;
  at: string;
  customer: string;
  phone: string;
  what: string;
  /** received and not yet refunded */
  paid: number;
  pending: number;
  method: PayMethod;
}

/** Find the ticket, POS sale or booking the money was paid for. */
function RefundPicker({ onClose, onPick }: { onClose: () => void; onPick: (t: Refundable) => void }) {
  const tickets = useStore((s) => s.tickets);
  const sales = useStore((s) => s.sales);
  const bookings = useStore((s) => s.bookings);
  const customers = useStore((s) => s.customers);
  const zones = useStore((s) => s.zones);
  const transactions = useStore((s) => s.transactions);
  const refunds = useStore((s) => s.refunds);
  const [kind, setKind] = useState<RefundRequest["target"]>("ticket");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const cmap = new Map(customers.map((c) => [c.id, c]));
    const pending = new Map<string, number>();
    refunds.filter((r) => r.status === "pending").forEach((r) => pending.set(r.targetId, (pending.get(r.targetId) ?? 0) + r.amount));
    // refunds go back the way the customer paid, by default
    const paidBy = (ref: string): PayMethod => {
      const m = transactions.find((t) => t.ref === ref && t.amount > 0)?.method ?? "cash";
      return m === "online" ? "card" : m;
    };
    let list: Refundable[];
    if (kind === "ticket")
      list = tickets
        .filter((t) => t.paid > 0 && t.status !== "cancelled")
        .map((t) => ({
          target: "ticket",
          id: t.id,
          label: t.code,
          at: t.checkOut ?? t.checkIn,
          customer: cmap.get(t.customerId)?.name ?? "",
          phone: cmap.get(t.customerId)?.phone ?? "",
          what: `${zones.find((z) => z.id === t.zoneId)?.name ?? ""} · ${t.visitors} visitor(s)`,
          paid: t.paid,
          pending: pending.get(t.id) ?? 0,
          method: paidBy(t.id),
        }));
    else if (kind === "sale")
      list = sales
        .filter((x) => x.total - (x.refunded ?? 0) > 0)
        .map((x) => ({
          target: "sale",
          id: x.id,
          label: x.no,
          at: x.at,
          customer: (x.customerId && cmap.get(x.customerId)?.name) || "Walk-in",
          phone: (x.customerId && cmap.get(x.customerId)?.phone) || "",
          what: x.items.map((i) => `${i.qty}× ${i.name}`).join(", "),
          paid: x.total - (x.refunded ?? 0),
          pending: pending.get(x.id) ?? 0,
          method: x.method,
        }));
    else
      list = bookings
        .filter((b) => b.paid > 0)
        .map((b) => ({
          target: "booking",
          id: b.id,
          label: b.ref,
          at: b.createdAt,
          customer: cmap.get(b.customerId)?.name ?? "",
          phone: cmap.get(b.customerId)?.phone ?? "",
          what: `${b.kind === "party" ? "Party" : "Play"} · ${b.date} ${b.start} · ${b.status}`,
          paid: b.paid,
          pending: pending.get(b.id) ?? 0,
          method: paidBy(b.id),
        }));
    const s = q.trim().toLowerCase();
    return list
      .filter((x) => !s || x.label.toLowerCase().includes(s) || x.customer.toLowerCase().includes(s) || x.phone.includes(s))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 40);
  }, [kind, q, tickets, sales, bookings, customers, zones, transactions, refunds]);

  const placeholder = kind === "ticket" ? "Ticket code, guardian or phone" : kind === "sale" ? "Sale no., customer or phone" : "Booking ref, customer or phone";

  return (
    <Modal open onClose={onClose} title="New refund — find the payment" width="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={kind} onChange={setKind} items={[{ value: "ticket", label: "Ticket" }, { value: "sale", label: "POS sale" }, { value: "booking", label: "Booking" }]} />
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input className="pl-9" autoFocus placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1 scroll-thin">
          {items.length === 0 && <Empty title="No matching payments" hint="Only payments with money left to refund are listed." />}
          {items.map((x) => (
            <button
              key={x.id}
              disabled={x.paid - x.pending <= 0}
              onClick={() => onPick(x)}
              className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-sky hover:bg-sky-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{x.label}</span>
                  <span className="text-xs text-muted">{fmtDT(x.at)}</span>
                </div>
                <div className="truncate text-sm">
                  {x.customer}
                  {x.phone && <span className="text-muted"> · {x.phone}</span>}
                </div>
                <div className="truncate text-xs text-muted">{x.what}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold tabular">{money(x.paid)}</div>
                <div className="text-[11px] text-muted">{methodLabel[x.method]}</div>
                {x.pending > 0 && <Badge tone="sun">{money(x.pending)} pending</Badge>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
