"use client";

import { QRCodeSVG } from "qrcode.react";
import { bookingQr } from "@/lib/booking";
import { CREDIT, CREDIT_PHONE } from "@/lib/credit";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { stayMinutes } from "@/lib/pricing";
import { isAgentReady, printDocument, type PrintBlock } from "@/lib/printAgent";
import { useAgentSettings } from "./PrinterAgentSettings";
import { fmtDate, fmtDT, fmtTime, methodLabel, minsToLabel } from "@/lib/utils";
import type { Sale, Ticket, Booking } from "@/lib/types";
import { Button, Modal, toast } from "./ui";

const n = (v: number) => Math.round(v).toLocaleString("en-LK");

function Row({ l, r, b }: { l: ReactNode; r: ReactNode; b?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${b ? "font-bold" : ""}`}>
      <span>{l}</span>
      <span className="text-right">{r}</span>
    </div>
  );
}
const Hr = () => <div className="my-1.5 border-t border-dashed border-black/60" />;
/** Last lines of every customer receipt. */
const Credit = () => (
  <div className="mt-2 text-center" style={{ fontSize: 9.5 }}>
    {CREDIT}
    <div>{CREDIT_PHONE}</div>
  </div>
);

function Head() {
  const s = useStore((x) => x.settings);
  return (
    <div className="text-center">
      <div style={{ fontFamily: "var(--font-fredoka)", fontSize: 22, fontWeight: 600, letterSpacing: 0.5 }}>{s.businessName}</div>
      <div style={{ fontSize: 10 }}>PLAY · GROW · SHINE</div>
      <div className="mt-1">{s.address}</div>
      <div>{s.phone}</div>
    </div>
  );
}

/** Printed at check-in: just enough to scan the family out later — the details come on the exit receipt. */
export function EntryTicket({ t, copy }: { t: Ticket; copy?: boolean }) {
  const settings = useStore((s) => s.settings);
  return (
    <div className="receipt mx-auto rounded-md border border-line p-4 shadow-sm">
      <div className="text-center" style={{ fontFamily: "var(--font-fredoka)", fontSize: 22, fontWeight: 600, letterSpacing: 0.5 }}>
        {settings.businessName}
      </div>
      {copy && <div className="mt-1 text-center font-bold">** COPY {t.reprints} **</div>}
      <div className="my-3 flex justify-center">
        <QRCodeSVG value={t.code} size={150} level="M" />
      </div>
      <div className="text-center" style={{ fontSize: 11 }}>{t.code}</div>
      <Hr />
      <div className="text-center">
        <div style={{ fontSize: 11 }}>IN</div>
        <div className="text-[22px] font-bold">{fmtTime(t.checkIn)}</div>
        <div style={{ fontSize: 11 }}>{fmtDate(t.checkIn)}</div>
      </div>
    </div>
  );
}

/** The detailed receipt given at check-out: the whole visit (play and/or co-work), priced by time spent. */
export function TicketReceipt({ tickets, copy }: { tickets: Ticket[]; copy?: boolean }) {
  const customers = useStore((s) => s.customers);
  const children = useStore((s) => s.children);
  const zones = useStore((s) => s.zones);
  const promos = useStore((s) => s.promotions);
  const users = useStore((s) => s.users);
  const settings = useStore((s) => s.settings);
  const t = tickets[0];
  const c = customers.find((x) => x.id === t.customerId);
  const kids = children.filter((k) => tickets.some((x) => x.childIds.includes(k.id)));
  const total = tickets.reduce((a, x) => a + x.total, 0);
  const paid = tickets.reduce((a, x) => a + x.paid, 0);
  return (
    <div className="receipt mx-auto rounded-md border border-line p-4 shadow-sm">
      <Head />
      <Hr />
      {copy && <div className="text-center font-bold">** REPRINT — COPY {t.reprints} **</div>}
      <div className="text-center text-[14px] font-bold">VISIT RECEIPT</div>
      <div className="my-2 flex justify-center">
        <QRCodeSVG value={t.visitId ?? t.code} size={132} level="M" />
      </div>
      <div className="text-center text-[15px] font-bold tracking-wider">{t.visitId ?? t.code}</div>
      <Hr />
      <Row l="Guardian" r={c?.name} />
      {kids.length > 0 && <Row l="Kids" r={kids.map((k) => k.name.split(" ")[0]).join(", ")} />}
      <Row l="In" r={fmtDT(t.checkIn)} />
      {t.checkOut && <Row l="Out" r={fmtTime(t.checkOut)} />}
      <Row l="Time spent" r={minsToLabel(stayMinutes(t))} b />
      {tickets.map((x) => {
        const z = zones.find((y) => y.id === x.zoneId);
        const pr = promos.find((y) => y.id === x.promoId);
        return (
          <div key={x.id}>
            <Hr />
            <div className="font-bold">
              {z?.name} · {x.visitors}
              {z?.kind === "play" ? ` kid(s)${x.adults ? ` + ${x.adults} adult(s)` : ""}` : " person(s)"}
            </div>
            <Row l={`Time x ${x.visitors}`} r={n(x.base)} />
            {x.ruleAdjust !== 0 && <Row l={x.ruleNames.join(", ") || "Rate rules"} r={n(x.ruleAdjust)} />}
            {x.overtimeFee > 0 && <Row l="Extra time" r={n(x.overtimeFee)} />}
            {x.discount > 0 && <Row l={pr ? `Promo ${pr.code}` : "Discount"} r={`-${n(x.discount)}`} />}
            {x.loyaltyUsed > 0 && <Row l="Loyalty points" r={`-${n(x.loyaltyUsed)}`} />}
            {tickets.length > 1 && <Row l="Subtotal" r={n(x.total)} />}
          </div>
        );
      })}
      <Hr />
      <Row l="TOTAL (LKR)" r={n(total)} b />
      <Row l="Paid" r={n(paid)} />
      <Hr />
      <div className="text-center" style={{ fontSize: 10.5 }}>
        Served by {users.find((u) => u.id === t.createdBy)?.name.split(" ")[0]}
        <div className="mt-1 font-bold">{settings.receiptFooter}</div>
      </div>
      <Credit />
    </div>
  );
}

export function SaleReceipt({ s }: { s: Sale }) {
  const users = useStore((x) => x.users);
  const settings = useStore((x) => x.settings);
  return (
    <div className="receipt mx-auto rounded-md border border-line p-4 shadow-sm">
      <Head />
      <Hr />
      <Row l="Receipt" r={s.no} />
      <Row l="Date" r={fmtDT(s.at)} />
      <Row l="Cashier" r={users.find((u) => u.id === s.userId)?.name.split(" ")[0]} />
      <Hr />
      {s.items.map((i) => (
        <div key={i.productId}>
          <div>{i.name}</div>
          <Row l={`  ${i.qty} x ${n(i.price)}`} r={n(i.qty * i.price)} />
        </div>
      ))}
      <Hr />
      <Row l="Subtotal" r={n(s.subtotal)} />
      {s.discount > 0 && <Row l="Discount" r={`-${n(s.discount)}`} />}
      <Row l="TOTAL (LKR)" r={n(s.total)} b />
      <Row l={methodLabel[s.method]} r={n(s.method === "cash" ? s.tendered : s.total)} />
      {s.method === "cash" && <Row l="Change" r={n(s.tendered - s.total)} />}
      <Hr />
      <div className="text-center" style={{ fontSize: 10.5 }}>
        Items: {s.items.reduce((a, i) => a + i.qty, 0)}
        <div className="mt-1 font-bold">{settings.receiptFooter}</div>
      </div>
      <Credit />
    </div>
  );
}

export function BookingConfirmation({ b }: { b: Booking }) {
  const customers = useStore((x) => x.customers);
  const packages = useStore((x) => x.packages);
  const c = customers.find((x) => x.id === b.customerId);
  const pk = packages.find((x) => x.id === b.packageId);
  return (
    <div className="receipt mx-auto rounded-md border border-line p-4 shadow-sm">
      <Head />
      <Hr />
      <div className="text-center text-[14px] font-bold">BOOKING CONFIRMATION</div>
      <div className="my-2 flex justify-center">
        <QRCodeSVG value={bookingQr(b)} size={110} />
      </div>
      <div className="text-center text-[15px] font-bold">{b.ref}</div>
      <Hr />
      <Row l="Name" r={c?.name} />
      <Row l="Type" r={b.kind === "party" ? `Party · ${b.mode === "full" ? "Full venue" : "Party room"}` : b.kind === "play" ? "Play visit" : "Co-work"} />
      {pk && <Row l="Package" r={pk.name} />}
      <Row l="Date" r={b.date} />
      <Row l="Time" r={`${b.start} – ${b.end}`} />
      <Row l="Guests" r={b.guests} />
      {b.theme && <Row l="Theme" r={b.theme} />}
      <Hr />
      <Row l="Total" r={n(b.total)} />
      <Row l="Paid" r={n(b.paid)} />
      <Row l="Balance due" r={n(b.total - b.paid)} b />
      <Hr />
      <Credit />
    </div>
  );
}

/**
 * Shows a receipt with a Print button. With `doc` and Print Agent set up on this PC (Settings →
 * Receipt printer) Print goes straight to the printer, and `autoPrint` prints as soon as it opens.
 */
export function PrintModal({ open, onClose, title, children, extra, doc, autoPrint }: { open: boolean; onClose: () => void; title: string; children: ReactNode; extra?: ReactNode; doc?: () => PrintBlock[]; autoPrint?: boolean }) {
  const agent = useAgentSettings();
  const direct = !!doc && isAgentReady(agent);
  const [sending, setSending] = useState(false);
  const autoSent = useRef(false);

  const send = useCallback(async () => {
    if (!doc) return;
    setSending(true);
    try {
      const r = await printDocument(doc(), { title });
      toast(`Printed on ${r.printer}`);
    } catch (e) {
      toast(`${(e as Error).message} Use Browser print instead.`, "err");
    }
    setSending(false);
  }, [doc, title]);

  useEffect(() => {
    if (!open || !direct || !autoPrint || !agent.autoPrint || autoSent.current) return;
    autoSent.current = true;
    queueMicrotask(send);
  }, [open, direct, autoPrint, agent.autoPrint, send]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          {extra}
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {direct && <Button variant="ghost" onClick={() => window.print()}>Browser print</Button>}
          <Button icon={<Printer size={16} />} onClick={direct ? send : () => window.print()} disabled={sending}>
            {sending ? "Printing…" : "Print"}
          </Button>
        </>
      }
    >
      <div className="print-area bg-[#f6f3ee] py-4">{children}</div>
    </Modal>
  );
}

export { methodLabel };
