"use client";

import { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { useStore, useCan, useMyShift } from "@/lib/store";
import { shiftSummary } from "@/lib/shift";
import { cx, fmtDT, fmtTime, methodLabel, money } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Table, Textarea, toast } from "@/components/ui";
import ShiftGate from "@/components/ShiftGate";
import { useNewReport } from "@/lib/useNewReport";
import { backupToFolder } from "@/lib/localBackup";

const NOTES = [5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export default function ShiftsPage() {
  const can = useCan();
  if (!can("shifts.own") && !can("shifts.all")) return <NoAccess what="shifts" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const shifts = useStore((s) => s.shifts);
  const tx = useStore((s) => s.transactions);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.currentUserId);
  const close = useStore((s) => s.closeShift);
  const mine = useMyShift();
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState<string | null>(null);

  const folderBackup = useStore((s) => s.folderBackup);
  const userName = useStore((s) => s.users.find((u) => u.id === s.currentUserId)?.name ?? "");

  // end of the shift: save a backup into this PC's backup folder (if one is set up on this PC)
  const saveEndOfDay = async () => {
    if (!can("settings.edit") && !can("backups.save")) return;
    const r = await backupToFolder("end-of-day", () => folderBackup(`Shift closed · ${userName}`));
    if (r === "saved") toast("Backup saved to the PC's backup folder");
    else if (r !== "no-folder") toast("The backup couldn't be saved to the PC's backup folder", "err");
  };

  const sum = mine ? shiftSummary(mine, tx) : null;
  const counted = NOTES.reduce((a, n) => a + n * (Number(counts[n]) || 0), 0);
  const history = useMemo(() => shifts.filter((s) => can("shifts.all") || s.userId === me).sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, 40), [shifts, me, can]);

  return (
    <>
      <PageHeader title="Cashier Shifts" subtitle="Opening float, cash vs card tallies, discounts and end-of-shift variance." />
      <ShiftGate />
      {mine && sum && (
        <Card title={<span className="flex items-center gap-2">My shift <Badge tone="mint">Open since {fmtTime(mine.openedAt)}</Badge></span>} action={<Button onClick={() => setCounting(true)}>Count cash & close</Button>}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Mini l="Opening float" v={money(mine.openingFloat)} />
            <Mini l="Cash sales" v={money(sum.cashSales)} />
            <Mini l="Card sales" v={money(sum.cardSales)} />
            <Mini l="Other (QR / transfer / wallet)" v={money(sum.total - sum.cashSales - sum.cardSales)} />
            <Mini l="Refunds" v={money(sum.refunds)} tone="rose" />
            <Mini l="Expected in drawer" v={money(sum.expected)} tone="navy" />
          </div>
          <p className="mt-3 text-xs text-muted">{sum.count} payments · {money(sum.discounts)} in discounts given this shift.</p>
        </Card>
      )}

      <Card className="mt-5" pad={false} title="Shift history">
        <Table head={["Cashier", "Opened", "Closed", "Float", "Cash", "Card", "Expected", "Counted", "Variance", ""]}>
          {history.map((s) => {
            const r = shiftSummary(s, tx);
            return (
              <tr key={s.id}>
                <td className="font-bold">{users.find((u) => u.id === s.userId)?.name}</td>
                <td className="tabular">{fmtDT(s.openedAt)}</td>
                <td className="tabular text-muted">{s.closedAt ? fmtTime(s.closedAt) : <Badge tone="mint">Open</Badge>}</td>
                <td className="tabular">{money(s.openingFloat)}</td>
                <td className="tabular">{money(r.cashSales)}</td>
                <td className="tabular">{money(r.cardSales)}</td>
                <td className="tabular">{money(r.expected)}</td>
                <td className="tabular">{s.countedCash != null ? money(s.countedCash) : "—"}</td>
                <td>{r.variance != null ? <Variance v={r.variance} /> : "—"}</td>
                <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setReport(s.id)}>Report</Button></td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Modal
        open={counting}
        onClose={() => setCounting(false)}
        title="Count the cash drawer"
        width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCounting(false)}>Cancel</Button>
            <Button onClick={async () => { const id = await close(counted, notes); if (!id) return; setCounting(false); setCounts({}); setNotes(""); toast("Shift closed"); setReport(id); saveEndOfDay(); }}>Close shift</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">Count only the notes and coins in the drawer — card, bank transfer, LankaQR and wallet payments are settled separately.</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {NOTES.map((n) => (
            <label key={n} className="flex items-center gap-2 text-sm">
              <span className="w-14 text-right font-bold tabular">{n >= 20 ? n.toLocaleString() : `${n}`}</span>
              <span className="text-muted">×</span>
              <Input className="h-8" type="number" min={0} value={counts[n] ?? ""} onChange={(e) => setCounts({ ...counts, [n]: e.target.value })} />
            </label>
          ))}
        </div>
        {sum && mine && (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-[#faf7f1] p-4 text-sm">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Cash in the drawer</div>
              <L l="Opening float" r={money(mine.openingFloat)} />
              <L l="+ Cash received this shift" r={money(sum.cashSales)} />
              {sum.cashRefunds > 0 && <L l="− Cash refunds paid out" r={money(sum.cashRefunds)} />}
              <div className="mt-1.5 border-t border-line pt-1.5"><L l="Expected in drawer" r={money(sum.expected)} b /></div>
            </div>
            {/* card / transfer / QR / wallet money never goes into the drawer, so it isn't part of the count */}
            {Object.entries(sum.by).some(([k, v]) => k !== "cash" && v > 0) && (
              <p className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">
                Not in the drawer, not counted:{" "}
                {Object.entries(sum.by).filter(([k, v]) => k !== "cash" && v > 0).map(([k, v]) => `${methodLabel[k]} ${money(v)}`).join(" · ")}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 rounded-2xl bg-sky-soft p-4 text-center">
              <div><div className="text-xs text-muted">Expected cash</div><div className="font-display text-lg font-semibold tabular">{money(sum.expected)}</div></div>
              <div><div className="text-xs text-muted">Counted</div><div className="font-display text-lg font-semibold tabular">{money(counted)}</div></div>
              <div><div className="text-xs text-muted">Variance</div><div className="font-display text-lg font-semibold"><Variance v={counted - sum.expected} /></div></div>
            </div>
            <p className="text-center text-xs text-muted">
              Cash takings to hand over (counted − float): <b className="tabular text-ink">{money(Math.max(0, counted - mine.openingFloat))}</b> · expected {money(sum.expected - mine.openingFloat)}
            </p>
          </div>
        )}
        <Field label="Notes (explain any variance)" className="mt-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </Modal>

      {report && <ShiftReport id={report} onClose={() => setReport(null)} />}
    </>
  );
}

function ShiftReport({ id, onClose }: { id: string; onClose: () => void }) {
  const sh = useStore((s) => s.shifts.find((x) => x.id === id))!;
  const tx = useStore((s) => s.transactions);
  const users = useStore((s) => s.users);
  const settings = useStore((s) => s.settings);
  const r = shiftSummary(sh, tx);
  const newReport = useNewReport();
  const cashier = users.find((u) => u.id === sh.userId)?.name ?? "";
  const downloadPdf = async () => {
    const p = await newReport("Shift-end report", `${fmtDT(sh.openedAt)} to ${sh.closedAt ? fmtDT(sh.closedAt) : "still open"}`);
    p.details([["Cashier", cashier], ["Status", sh.closedAt ? "Closed" : "Open"], ["Opened", fmtDT(sh.openedAt)], ["Closed", sh.closedAt ? fmtDT(sh.closedAt) : "-"]]);
    p.heading("Takings by payment method");
    const by = Object.entries(r.by);
    p.table(["Payment method", "Amount (Rs.)"], by.map(([k, v]) => [methodLabel[k] ?? k, v]), { align: ["l", "r"], foot: ["Gross takings", r.total] });
    p.heading("Cash drawer reconciliation");
    p.statement(["Amount (Rs.)"], [
      { kind: "line", label: "Opening float", values: [sh.openingFloat] },
      { kind: "line", label: "Add: cash sales", values: [r.cashSales] },
      { kind: "line", label: "Less: cash refunds", values: [r.cashRefunds], neg: true },
      { kind: "subtotal", label: "Expected cash in drawer", values: [r.expected] },
      { kind: "line", label: "Counted cash", values: [sh.countedCash ?? 0] },
      { kind: "grand", label: r.variance == null ? "Variance (not counted yet)" : r.variance === 0 ? "Variance — balanced" : r.variance < 0 ? "Variance — cash short" : "Variance — cash over", values: [r.variance ?? 0] },
    ]);
    p.paragraph(`Refunds in the shift: ${money(r.refunds)}. Discounts given: ${money(r.discounts)} on ${r.discountTx.length} payment(s).${sh.countedCash != null ? ` Cash to hand over (counted less float): ${money(Math.max(0, sh.countedCash - sh.openingFloat))}.` : ""}`);
    if (sh.notes) p.paragraph(`Cashier's note: ${sh.notes}`, { muted: false });
    if (r.discountTx.length) {
      p.heading("Discount audit");
      p.table(["Time", "Reference", "Discount (Rs.)"], [...r.discountTx].sort((x, y) => x.at.localeCompare(y.at)).map((t) => [fmtTime(t.at), t.refLabel, t.discount]), { align: ["l", "l", "r"], foot: ["Total", "", r.discounts] });
    }
    p.signatures(["Cashier", "Checked by (manager)"]);
    p.save(`shift-report_${cashier.replace(/\s+/g, "-").toLowerCase()}_${sh.openedAt.slice(0, 10)}`);
  };
  return (
    <Modal open onClose={onClose} title="Shift-end report" width="max-w-md" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>Print slip</Button><Button icon={<FileText size={15} />} onClick={() => downloadPdf().catch(() => toast("Couldn't create the PDF", "err"))}>Download PDF</Button></>}>
      <div className="print-area bg-[#f6f3ee] py-4">
        <div className="receipt mx-auto rounded-md border border-line p-4">
          <div className="text-center" style={{ fontFamily: "var(--font-fredoka)", fontSize: 18, fontWeight: 600 }}>{settings.businessName}</div>
          <div className="text-center font-bold">SHIFT REPORT</div>
          <div className="my-1.5 border-t border-dashed border-black/60" />
          <L l="Cashier" r={users.find((u) => u.id === sh.userId)?.name} />
          <L l="Opened" r={fmtDT(sh.openedAt)} />
          <L l="Closed" r={sh.closedAt ? fmtDT(sh.closedAt) : "OPEN"} />
          <div className="my-1.5 border-t border-dashed border-black/60" />
          {Object.entries(r.by).map(([k, v]) => <L key={k} l={methodLabel[k]} r={v.toLocaleString()} />)}
          <L l="Gross takings" r={r.total.toLocaleString()} b />
          <L l="Refunds" r={r.refunds ? `-${r.refunds.toLocaleString()}` : "0"} />
          <L l={`Discounts (${r.discountTx.length})`} r={r.discounts.toLocaleString()} />
          <div className="my-1.5 border-t border-dashed border-black/60" />
          <L l="Opening float" r={sh.openingFloat.toLocaleString()} />
          <L l="+ Cash sales" r={r.cashSales.toLocaleString()} />
          <L l="- Cash refunds" r={r.cashRefunds.toLocaleString()} />
          <L l="Expected cash" r={r.expected.toLocaleString()} b />
          <L l="Counted cash" r={sh.countedCash?.toLocaleString() ?? "—"} />
          <L l="VARIANCE" r={r.variance != null ? r.variance.toLocaleString() : "—"} b />
          {sh.notes && <div className="mt-1">Note: {sh.notes}</div>}
          {r.discountTx.length > 0 && (
            <>
              <div className="my-1.5 border-t border-dashed border-black/60" />
              <div className="font-bold">Discount audit</div>
              {[...r.discountTx].sort((x, y) => x.at.localeCompare(y.at)).slice(0, 15).map((t) => <L key={t.id} l={`${fmtTime(t.at)} ${t.refLabel}`} r={t.discount.toLocaleString()} />)}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

const L = ({ l, r, b }: { l: React.ReactNode; r: React.ReactNode; b?: boolean }) => <div className={cx("flex justify-between", b && "font-bold")}><span>{l}</span><span>{r}</span></div>;
const Mini = ({ l, v, tone }: { l: string; v: string; tone?: "rose" | "navy" }) => (
  <div className={cx("rounded-xl p-3", tone === "navy" ? "bg-sky-soft" : tone === "rose" ? "bg-rose-soft" : "bg-[#faf7f1]")}>
    <div className="text-xs text-muted">{l}</div>
    <div className="mt-0.5 font-display text-lg font-semibold tabular">{v}</div>
  </div>
);
function Variance({ v }: { v: number }) {
  if (v === 0) return <Badge tone="mint">Balanced</Badge>;
  return <span className={cx("font-bold tabular", v < 0 ? "text-[#c24f69]" : "text-[#a37812]")}>{v > 0 ? "+" : ""}{money(v)}</span>;
}
