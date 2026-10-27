"use client";

import { useMemo, useState } from "react";
import { Printer, RotateCcw, Search, XCircle } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import { visitOf } from "@/lib/pricing";
import { useScanField } from "@/lib/hooks";
import type { Ticket, TicketStatus } from "@/lib/types";
import { fmtDT, money, minsToLabel, downloadCSV } from "@/lib/utils";
import { localDay } from "@/lib/accounting";
import { Badge, Button, Card, Input, Modal, NoAccess, PageHeader, Table, Tabs, Textarea, toast, type Tone } from "@/components/ui";
import { EntryTicket, PrintModal, TicketReceipt } from "@/components/Receipts";
import { entryTicketDoc, ticketDoc } from "@/lib/receiptDocs";
import RefundDialog from "@/components/RefundDialog";

const statusTone: Record<TicketStatus, Tone> = { active: "mint", completed: "sky", cancelled: "gray", expired: "sun", refunded: "rose" };

export default function TicketsPage() {
  const can = useCan();
  if (!can("tickets.view")) return <NoAccess what="tickets" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const tickets = useStore((s) => s.tickets);
  const customers = useStore((s) => s.customers);
  const zones = useStore((s) => s.zones);
  const transactions = useStore((s) => s.transactions);
  const reprint = useStore((s) => s.reprintTicket);
  const cancel = useStore((s) => s.cancelTicket);
  const settings = useStore((s) => s.settings);
  const [status, setStatus] = useState<"all" | TicketStatus>("all");
  const [q, setQ] = useState("");
  const [scanRef] = useScanField();
  const [date, setDate] = useState("");
  const [limit, setLimit] = useState(50);
  const [print, setPrint] = useState<Ticket | null>(null);
  const [refund, setRefund] = useState<Ticket | null>(null);
  const [cancelT, setCancelT] = useState<Ticket | null>(null);
  const [reason, setReason] = useState("");

  const cmap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tickets
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => !date || localDay(t.checkIn) === date)
      .filter((t) => !s || t.code.toLowerCase().includes(s) || cmap.get(t.customerId)?.name.toLowerCase().includes(s) || cmap.get(t.customerId)?.phone.includes(s))
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  }, [tickets, status, q, date, cmap]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tickets.length };
    tickets.forEach((t) => (c[t.status] = (c[t.status] ?? 0) + 1));
    return c;
  }, [tickets]);

  const methodFor = (t: Ticket) => transactions.find((x) => x.ref === t.id && x.amount > 0)?.method ?? "cash";

  const doCancel = async () => {
    if (!cancelT || !reason.trim()) return toast("A reason is required", "err");
    // anything already paid is refunded by the server (auto-approved when this user may approve)
    const m = methodFor(cancelT);
    if (!(await cancel(cancelT.id, reason, m === "online" ? "card" : m))) return;
    toast(`${cancelT.code} cancelled`);
    setCancelT(null);
    setReason("");
  };

  return (
    <>
      <PageHeader
        title="Tickets"
        subtitle="Search, reprint, cancel or refund any ticket. Every action is written to the audit log."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV("tickets.csv", [
                ["Code", "Status", "Guardian", "Zone", "Visitors", "Check-in", "Check-out", "Total"],
                ...list.map((t) => [t.code, t.status, cmap.get(t.customerId)?.name ?? "", zones.find((z) => z.id === t.zoneId)?.name ?? "", t.visitors, t.checkIn, t.checkOut ?? "", t.total]),
              ])
            }
          >
            Export CSV
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={(v) => { setStatus(v); setLimit(50); }}
          items={(["all", "active", "completed", "cancelled", "expired", "refunded"] as const).map((s) => ({ value: s, label: <span className="capitalize">{s} <span className="opacity-60">{counts[s] ?? 0}</span></span> }))}
        />
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input ref={scanRef} className="pl-9" placeholder="Ticket code, guardian or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Card pad={false}>
        <Table head={["Ticket", "Status", "Guardian", "Zone", "Visitors", "Checked in", "Stay", "Total", ""]}>
          {list.slice(0, limit).map((t) => {
            const c = cmap.get(t.customerId);
            const stay = t.checkOut ? (new Date(t.checkOut).getTime() - new Date(t.checkIn).getTime()) / 60000 : null;
            return (
              <tr key={t.id}>
                <td className="font-mono text-xs font-bold">{t.code}</td>
                <td><Badge tone={statusTone[t.status]}><span className="capitalize">{t.status}</span></Badge></td>
                <td>
                  <div className="font-semibold">{c?.name}</div>
                  <div className="text-xs text-muted">{c?.phone}</div>
                </td>
                <td className="text-muted">{zones.find((z) => z.id === t.zoneId)?.name}</td>
                <td className="tabular">{t.visitors}</td>
                <td className="whitespace-nowrap tabular">{fmtDT(t.checkIn)}</td>
                <td className="tabular text-muted">{stay != null ? minsToLabel(stay) : "—"}</td>
                <td className="tabular font-bold">{money(t.total)}{t.overtimeFee > 0 && <div className="text-[11px] font-normal text-[#c24f69]">incl. OT {money(t.overtimeFee)}</div>}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    {can("tickets.reprint") && (
                      <IconBtn title="Reprint" onClick={async () => { if (await reprint(t.id)) setPrint({ ...t, reprints: t.reprints + 1 }); }}>
                        <Printer size={15} />
                      </IconBtn>
                    )}
                    {can("tickets.cancel") && t.status === "active" && (
                      <IconBtn title="Cancel" onClick={() => setCancelT(t)}>
                        <XCircle size={15} />
                      </IconBtn>
                    )}
                    {can("refunds.request") && (t.status === "completed" || t.status === "active") && t.paid > 0 && (
                      <IconBtn title="Refund" onClick={() => setRefund(t)}>
                        <RotateCcw size={15} />
                      </IconBtn>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
        {list.length > limit && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(limit + 100)}>Show more ({list.length - limit} left)</Button>
          </div>
        )}
      </Card>

      {print && (
        <PrintModal open onClose={() => setPrint(null)} title={`Reprint ${print.code}`} doc={() => (print.status === "active" ? entryTicketDoc(print, true) : ticketDoc(visitOf(print, tickets).filter((x) => x.status !== "active"), true))} autoPrint>
          {/* a visit still in progress gets its entry ticket back; a finished one gets the detailed receipt */}
          {print.status === "active" ? <EntryTicket t={print} copy /> : <TicketReceipt tickets={visitOf(print, tickets).filter((x) => x.status !== "active")} copy />}
        </PrintModal>
      )}
      {refund && <RefundDialog open onClose={() => setRefund(null)} target="ticket" targetId={refund.id} label={refund.code} max={refund.paid} method={(() => { const m = methodFor(refund); return m === "online" ? "card" : m; })()} />}
      <Modal
        open={!!cancelT}
        onClose={() => setCancelT(null)}
        title={`Cancel ${cancelT?.code}`}
        footer={<><Button variant="secondary" onClick={() => setCancelT(null)}>Keep ticket</Button><Button variant="danger" onClick={doCancel}>Cancel ticket</Button></>}
      >
        <p className="mb-3 text-sm text-muted">
          The visitor count is released from the zone immediately. {cancelT && cancelT.paid > 0 && <>A full refund of <b>{money(cancelT.paid)}</b> will be {can("refunds.approve") || !settings.refundNeedsApproval ? "processed" : "sent for manager approval"}.</>}
        </p>
        <Textarea placeholder="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy">
      {children}
    </button>
  );
}
