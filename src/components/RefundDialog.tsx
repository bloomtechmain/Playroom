"use client";

import { useState } from "react";
import { useStore, useCan } from "@/lib/store";
import { REFUND_REASONS, type PayMethod, type RefundCategory, type RefundRequest } from "@/lib/types";
import { fmtDT, money } from "@/lib/utils";
import { Button, Field, Input, Modal, Select, Tabs, Textarea, toast } from "./ui";
import { methodLabel } from "@/lib/utils";

export default function RefundDialog({
  open,
  onClose,
  target,
  targetId,
  label,
  max: paid,
  method: defaultMethod,
  category: defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  target: RefundRequest["target"];
  targetId: string;
  label: string;
  /** money received on the target that hasn't been refunded yet */
  max: number;
  method: PayMethod;
  category?: RefundCategory;
}) {
  const can = useCan();
  const settings = useStore((s) => s.settings);
  const refund = useStore((s) => s.refund);
  const refunds = useStore((s) => s.refunds);
  const [busy, setBusy] = useState(false);
  // requests still waiting for a manager count against what can be refunded
  const pendingAmt = refunds.filter((r) => r.targetId === targetId && r.status === "pending").reduce((a, r) => a + r.amount, 0);
  const max = Math.max(0, paid - pendingAmt);
  const [category, setCategory] = useState<RefundCategory | "">(defaultCategory ?? "");
  const [kind, setKind] = useState<"full" | "partial">(defaultCategory && REFUND_REASONS.find((r) => r.value === defaultCategory)?.partial ? "partial" : "full");
  const [amount, setAmount] = useState(kind === "full" ? String(max) : "");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PayMethod>(defaultMethod);
  const [mgrUser, setMgrUser] = useState("");
  const [mgrPw, setMgrPw] = useState("");

  const reasonInfo = REFUND_REASONS.find((r) => r.value === category);
  const amt = kind === "full" ? max : Math.min(max, Number(amount) || 0);
  const selfApprove = can("refunds.approve") || !settings.refundNeedsApproval;

  const pickCategory = (c: RefundCategory) => {
    setCategory(c);
    const partial = REFUND_REASONS.find((r) => r.value === c)?.partial;
    setKind(partial ? "partial" : "full");
    if (partial) setAmount("");
  };

  const submit = async (mode: "queue" | "now" | "override") => {
    if (!category) return toast("Choose why the money is going back", "err");
    if (!reason.trim()) return toast("Please give a reason — it goes into the audit log", "err");
    if (amt <= 0) return toast("Enter a refund amount", "err");
    setBusy(true);
    const req = { target, targetId, label, maxAmount: max, amount: amt, full: kind === "full" && amt >= paid, category, reason, method };
    const r = mode === "override" ? await refund(req, "manager", { username: mgrUser, password: mgrPw }) : await refund(req, mode);
    setBusy(false);
    if (!r) return;
    if (mode === "override") toast(`Refund of ${money(amt)} approved by ${r.approvedBy?.split(" ")[0] ?? "manager"}`);
    else if (mode === "now") toast(`Refunded ${money(amt)}`);
    else toast("Refund sent for manager approval");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Refund · ${label}`} width="max-w-xl">
      <div className="space-y-4">
        <Charged target={target} targetId={targetId} paid={paid} pending={pendingAmt} />
        {max <= 0 ? (
          <p className="rounded-xl bg-sun-soft px-3 py-2 text-sm font-bold text-[#8a6510]">
            Nothing left to refund — {pendingAmt > 0 ? "the rest is already waiting for approval in Refunds." : "this payment has been refunded in full."}
          </p>
        ) : (
          <>
            <Field label="Why is money going back?">
              <Select value={category} onChange={(e) => pickCategory(e.target.value as RefundCategory)}>
                <option value="" disabled>Choose a reason…</option>
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <Tabs value={kind} onChange={setKind} items={[{ value: "full", label: `Full (${money(max)})` }, { value: "partial", label: "Partial" }]} />
            {kind === "partial" && (
              <Field label="Amount (Rs.)" hint={reasonInfo?.hint ? `${reasonInfo.hint} Up to ${money(max)}.` : `Up to ${money(max)}`}>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </Field>
            )}
            <Field label="Refund to">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                {(["cash", "card", "digital", "transfer", "wallet"] as PayMethod[]).map((m) => (
                  <option key={m} value={m}>{methodLabel[m]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Details">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={category === "overcharge" ? "e.g. Charged the weekend rate on a weekday — should have been Rs. 1,500" : "e.g. Child felt unwell and left after 10 minutes"}
              />
            </Field>
            {!selfApprove && (
              <div className="rounded-xl border border-dashed border-[#d6cdbd] p-3">
                <p className="mb-2 text-xs font-bold text-muted">Manager approval at the counter (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Manager username" value={mgrUser} onChange={(e) => setMgrUser(e.target.value)} />
                  <Input placeholder="Password" type="password" value={mgrPw} onChange={(e) => setMgrPw(e.target.value)} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Demo: manager / demo123</p>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {max > 0 &&
            (selfApprove ? (
              <Button variant="danger" disabled={busy} onClick={() => submit("now")}>Refund {money(amt)}</Button>
            ) : (
              <>
                {mgrUser && mgrPw && <Button variant="danger" disabled={busy} onClick={() => submit("override")}>Approve & refund now</Button>}
                <Button disabled={busy} onClick={() => submit("queue")}>Send for approval</Button>
              </>
            ))}
        </div>
      </div>
    </Modal>
  );
}

/** What the customer was charged, so the cashier can see where a mistake happened. */
function Charged({ target, targetId, paid, pending }: { target: RefundRequest["target"]; targetId: string; paid: number; pending: number }) {
  const ticket = useStore((s) => (target === "ticket" ? s.tickets.find((t) => t.id === targetId) : undefined));
  const sale = useStore((s) => (target === "sale" ? s.sales.find((t) => t.id === targetId) : undefined));
  const booking = useStore((s) => (target === "booking" ? s.bookings.find((t) => t.id === targetId) : undefined));
  const customers = useStore((s) => s.customers);
  const customerId = ticket?.customerId ?? sale?.customerId ?? booking?.customerId;
  const cust = customers.find((c) => c.id === customerId);

  const lines: [string, number][] = [];
  let when = "";
  let charged = 0;
  if (ticket) {
    when = ticket.checkOut ?? ticket.checkIn;
    lines.push([`Base · ${ticket.visitors} visitor(s)`, ticket.base]);
    if (ticket.ruleAdjust) lines.push([ticket.ruleNames.join(", ") || "Day & time rules", ticket.ruleAdjust]);
    if (ticket.discount) lines.push(["Discounts", -ticket.discount]);
    if (ticket.loyaltyUsed) lines.push(["Loyalty points", -ticket.loyaltyUsed]);
    if (ticket.overtimeFee) lines.push(["Overtime", ticket.overtimeFee]);
    charged = ticket.total;
  } else if (sale) {
    when = sale.at;
    sale.items.forEach((i) => lines.push([`${i.qty} × ${i.name}`, i.qty * i.price]));
    if (sale.discount) lines.push(["Discount", -sale.discount]);
    charged = sale.total;
  } else if (booking) {
    when = booking.createdAt;
    lines.push([`Booking ${booking.date} ${booking.start}–${booking.end}`, booking.total]);
    charged = booking.total;
  }
  const refunded = sale ? sale.refunded ?? 0 : Math.max(0, (booking ? booking.paid : charged) - paid);

  return (
    <div className="rounded-2xl bg-[#faf7f1] p-4 text-sm">
      <div className="mb-2 flex justify-between text-xs text-muted">
        <span>{cust ? `${cust.name} · ${cust.phone}` : "Walk-in"}</span>
        {when && <span>{fmtDT(when)}</span>}
      </div>
      {lines.map(([l, v], i) => (
        <div key={i} className="flex justify-between py-0.5">
          <span className="text-muted">{l}</span>
          <span className="tabular">{money(v)}</span>
        </div>
      ))}
      <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-bold">
        <span>{booking ? "Paid so far" : "Charged"}</span>
        <span className="tabular">{money(booking ? paid : charged)}</span>
      </div>
      {!booking && refunded > 0 && (
        <div className="flex justify-between text-[#c24f69]">
          <span>Already refunded</span>
          <span className="tabular">−{money(refunded)}</span>
        </div>
      )}
      {pending > 0 && (
        <div className="flex justify-between text-[#a37812]">
          <span>Waiting for approval</span>
          <span className="tabular">−{money(pending)}</span>
        </div>
      )}
    </div>
  );
}
