"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNewReport } from "@/lib/useNewReport";
import type { Range } from "@/lib/accounting";
import { cafeFigures, combine, daysOf, partyFigures, STREAM_LABEL, streamFigures, UNITS, visitFigures, type Stream, type StreamFigures, type Unit } from "@/lib/unitReport";
import { downloadCSV, methodLabel, minsToLabel } from "@/lib/utils";
import { Button, Select } from "./ui";

/**
 * Sales reports for the café / POS, the playroom and co-working — each on its own, all combined, or the whole
 * set. Plain tables only. Every report is a list of sections defined once, so the screen, the PDF and the CSV match.
 */

type View = "combined" | Unit | "all";
type Cell = string | number; // numbers are rupee amounts; counts and percentages are passed as text
interface Section {
  title: string;
  head: string[];
  rows: Cell[][];
  /** right-align these columns (amounts and counts) */
  right: number[];
  foot?: Cell[];
}

const rs = (n: number) => (n ? `${n < 0 ? "(" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${n < 0 ? ")" : ""}` : "-");
const cnt = (n: number) => (n ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "-");
const pctOf = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "-");
const dayLabel = (d: string) => format(new Date(d + "T00:00"), "EEE d MMM yyyy");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function methodRows(byMethod: Record<string, number>, total: number): Cell[][] {
  return Object.entries(byMethod)
    .filter(([, v]) => v)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [methodLabel[k] ?? k, v, pctOf(v, total)]);
}

function revenueSection(title: string, streams: Stream[], f: Record<Stream, StreamFigures>): Section {
  const all = combine(streams.map((s) => f[s]));
  return {
    title,
    head: ["Revenue stream", "Payments", "Gross sales (Rs.)", "Discounts given (Rs.)", "Refunds (Rs.)", "Net sales (Rs.)"],
    rows: streams.map((s) => [STREAM_LABEL[s], cnt(f[s].payments), f[s].gross, f[s].discounts, -f[s].refunds, f[s].net]),
    right: [1, 2, 3, 4, 5],
    foot: streams.length > 1 ? ["Total", cnt(all.payments), all.gross, all.discounts, -all.refunds, all.net] : undefined,
  };
}

export function UnitReports({ range, pdfRef, period, fileRange }: { range: Range; pdfRef: RefObject<(() => Promise<void>) | null>; period: string; fileRange: string }) {
  const tx = useStore((s) => s.transactions);
  const sales = useStore((s) => s.sales);
  const products = useStore((s) => s.products);
  const tickets = useStore((s) => s.tickets);
  const zones = useStore((s) => s.zones);
  const bookings = useStore((s) => s.bookings);
  const [view, setView] = useState<View>("combined");

  const reports = useMemo(() => {
    const f = streamFigures(tx, range);
    const days = daysOf(range);
    const unitFig = (u: Unit) => combine(UNITS.find((x) => x.key === u)!.streams.map((s) => f[s]));
    const total = combine(UNITS.map((u) => unitFig(u.key)));

    // ---------------------------------------------------------------- café & POS
    const cafe = cafeFigures(sales, (id) => products.find((p) => p.id === id)?.category ?? "", range);
    const pos = f.pos;
    const cafeSections: Section[] = [
      {
        title: "Summary",
        head: ["", "Amount"],
        rows: [
          ["Receipts", cnt(cafe.receipts)],
          ["Items sold", cnt(cafe.items)],
          ["Gross sales (Rs.)", pos.gross],
          ["Discounts given (Rs.)", pos.discounts],
          ["Refunds (Rs.)", -pos.refunds],
          ["Net sales (Rs.)", pos.net],
          ["Cost of goods sold (Rs.)", -cafe.cost],
          ["Gross profit (Rs.)", pos.net - cafe.cost],
          ["Gross margin", pctOf(pos.net - cafe.cost, pos.net)],
          ["Average sale (Rs.)", cafe.receipts ? Math.round(pos.gross / cafe.receipts) : 0],
        ],
        right: [1],
      },
      {
        title: "Sales by category",
        head: ["Category", "Qty", "Sales (Rs.)", "Cost (Rs.)", "Profit (Rs.)", "Margin"],
        rows: cafe.categories.map((c) => [c.name, cnt(c.qty), c.sales, -c.cost, c.sales - c.cost, pctOf(c.sales - c.cost, c.sales)]),
        right: [1, 2, 3, 4, 5],
        foot: ["Total", cnt(sum(cafe.categories.map((c) => c.qty))), sum(cafe.categories.map((c) => c.sales)), -cafe.cost, sum(cafe.categories.map((c) => c.sales)) - cafe.cost, ""],
      },
      {
        title: "Sales by product",
        head: ["Product", "Category", "Qty", "Sales (Rs.)", "Cost (Rs.)", "Profit (Rs.)"],
        rows: cafe.products.map((p) => [p.name, p.category, cnt(p.qty), p.sales, -p.cost, p.sales - p.cost]),
        right: [2, 3, 4, 5],
      },
      { title: "Payment methods", head: ["Method", "Amount (Rs.)", "Share"], rows: methodRows(pos.byMethod, pos.gross), right: [1, 2], foot: ["Total", pos.gross, ""] },
      { title: "Daily net sales", head: ["Date", "Net sales (Rs.)"], rows: days.map((d) => [dayLabel(d), pos.daily[d] ?? 0]), right: [1], foot: ["Total", pos.net] },
    ];

    // ---------------------------------------------------------------- playroom
    const play = visitFigures(tickets, zones, "play", range);
    const party = partyFigures(bookings, range);
    const room = unitFig("playroom");
    const playroomSections: Section[] = [
      {
        title: "Summary",
        head: ["", "Amount"],
        rows: [
          ["Play visits", cnt(play.visits)],
          ["Children", cnt(play.people)],
          ["Accompanying adults", cnt(play.adults)],
          ["Average stay", play.avgMinutes ? minsToLabel(play.avgMinutes) : "-"],
          ["Parties held", cnt(party.parties)],
          ["  of which whole venue", cnt(party.fullVenue)],
          ["Party guests", cnt(party.guests)],
          ["Value of parties held (Rs.)", party.value],
          ["  of which overtime charged (Rs.)", party.overtime],
          ["Party balances still to collect (Rs.)", party.outstanding],
          ["Net sales received (Rs.)", room.net],
        ],
        right: [1],
      },
      revenueSection("Revenue received", ["play", "party"], f),
      ...(play.byZone.length > 1
        ? [{ title: "Play visits by area", head: ["Area", "Visits", "Children"], rows: play.byZone.map((z) => [z.zone, cnt(z.visits), cnt(z.people)]), right: [1, 2] } as Section]
        : []),
      { title: "Payment methods", head: ["Method", "Amount (Rs.)", "Share"], rows: methodRows(room.byMethod, room.gross), right: [1, 2], foot: ["Total", room.gross, ""] },
      {
        title: "Daily net sales",
        head: ["Date", "Play sessions (Rs.)", "Parties (Rs.)", "Total (Rs.)"],
        rows: days.map((d) => [dayLabel(d), f.play.daily[d] ?? 0, f.party.daily[d] ?? 0, room.daily[d] ?? 0]),
        right: [1, 2, 3],
        foot: ["Total", f.play.net, f.party.net, room.net],
      },
    ];

    // ---------------------------------------------------------------- co-working
    const cw = visitFigures(tickets, zones, "cowork", range);
    const cwf = f.cowork;
    const coworkSections: Section[] = [
      {
        title: "Summary",
        head: ["", "Amount"],
        rows: [
          ["Visits", cnt(cw.visits)],
          ["People", cnt(cw.people)],
          ["Hours used", cnt(Math.round(cw.hours * 10) / 10)],
          ["Average stay", cw.avgMinutes ? minsToLabel(cw.avgMinutes) : "-"],
          ["Gross sales (Rs.)", cwf.gross],
          ["Discounts given (Rs.)", cwf.discounts],
          ["Refunds (Rs.)", -cwf.refunds],
          ["Net sales (Rs.)", cwf.net],
          ["Average per visit (Rs.)", cw.visits ? Math.round(cwf.net / cw.visits) : 0],
        ],
        right: [1],
      },
      { title: "Payment methods", head: ["Method", "Amount (Rs.)", "Share"], rows: methodRows(cwf.byMethod, cwf.gross), right: [1, 2], foot: ["Total", cwf.gross, ""] },
      { title: "Daily net sales", head: ["Date", "Net sales (Rs.)"], rows: days.map((d) => [dayLabel(d), cwf.daily[d] ?? 0]), right: [1], foot: ["Total", cwf.net] },
    ];

    // ---------------------------------------------------------------- combined
    const methods = [...new Set(UNITS.flatMap((u) => Object.keys(unitFig(u.key).byMethod)))];
    const combinedSections: Section[] = [
      {
        title: "Sales by business unit",
        head: ["Business unit", "Payments", "Gross sales (Rs.)", "Discounts given (Rs.)", "Refunds (Rs.)", "Net sales (Rs.)", "Share of net"],
        rows: UNITS.flatMap((u) => {
          const x = unitFig(u.key);
          const row: Cell[] = [u.label, cnt(x.payments), x.gross, x.discounts, -x.refunds, x.net, pctOf(x.net, total.net)];
          return u.streams.length > 1 ? [row, ...u.streams.map((s): Cell[] => [`    ${STREAM_LABEL[s]}`, cnt(f[s].payments), f[s].gross, f[s].discounts, -f[s].refunds, f[s].net, pctOf(f[s].net, total.net)])] : [row];
        }),
        right: [1, 2, 3, 4, 5, 6],
        foot: ["Total", cnt(total.payments), total.gross, total.discounts, -total.refunds, total.net, total.net ? "100.0%" : "-"],
      },
      {
        title: "Café gross profit",
        head: ["", "Amount (Rs.)"],
        rows: [["Café & POS net sales", pos.net], ["Cost of goods sold", -cafe.cost], ["Café gross profit", pos.net - cafe.cost]],
        right: [1],
      },
      {
        title: "Payment methods by business unit",
        head: ["Method", ...UNITS.map((u) => `${u.label} (Rs.)`), "Total (Rs.)"],
        rows: methods.map((m) => [methodLabel[m] ?? m, ...UNITS.map((u) => unitFig(u.key).byMethod[m] ?? 0), total.byMethod[m] ?? 0]),
        right: [1, 2, 3, 4],
        foot: ["Total", ...UNITS.map((u) => unitFig(u.key).gross), total.gross],
      },
      {
        title: "Daily net sales by business unit",
        head: ["Date", ...UNITS.map((u) => `${u.label} (Rs.)`), "Total (Rs.)"],
        rows: days.map((d) => [dayLabel(d), ...UNITS.map((u) => unitFig(u.key).daily[d] ?? 0), total.daily[d] ?? 0]),
        right: [1, 2, 3, 4],
        foot: ["Total", ...UNITS.map((u) => unitFig(u.key).net), total.net],
      },
    ];

    return {
      combined: { title: "Sales report — all business units", sections: combinedSections },
      cafe: { title: "Sales report — Café & POS", sections: cafeSections },
      playroom: { title: "Sales report — Playroom", sections: playroomSections },
      cowork: { title: "Sales report — Co-working", sections: coworkSections },
    };
  }, [tx, sales, products, tickets, zones, bookings, range]);

  const shown = view === "all" ? (["combined", "cafe", "playroom", "cowork"] as const).map((k) => reports[k]) : [reports[view]];
  const note =
    "Cash basis: amounts are payments received in the period (party deposits when paid), less refunds, which are shown against the unit they were given for. Wallet top-ups are not sales. Only the café's cost of goods is split by unit; operating expenses are in the Profit & Loss.";
  const fileName = `sales-${view === "all" ? "all-units" : view}_${fileRange}`;

  const newReport = useNewReport();
  useEffect(() => {
    pdfRef.current = async () => {
      const r = await newReport(view === "all" ? "Sales report — combined and by business unit" : shown[0].title, period);
      for (const rep of shown) {
        if (view === "all") r.heading(rep.title.replace("Sales report — ", "").toUpperCase());
        for (const s of rep.sections) {
          r.heading(s.title);
          r.table(s.head, s.rows, { align: s.head.map((_, i) => (s.right.includes(i) ? "r" : "l")), foot: s.foot });
        }
      }
      r.paragraph(note);
      r.signatures(["Prepared by", "Checked by"]);
      r.save(fileName);
    };
  });

  const csv = () =>
    downloadCSV(
      `${fileName}.csv`,
      shown.flatMap((rep) => [[rep.title], [period], ...rep.sections.flatMap((s) => [[], [s.title], s.head, ...s.rows, ...(s.foot ? [s.foot] : [])]), []]),
    );

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select className="w-72" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="combined">Combined — all business units</option>
          {UNITS.map((u) => <option key={u.key} value={u.key}>{u.label} only</option>)}
          <option value="all">Everything — combined and each unit</option>
        </Select>
        <span className="text-sm text-muted">{period}</span>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={csv}>CSV</Button>
      </div>
      {shown.map((rep) => (
        <div key={rep.title} className="mb-8 last:mb-0">
          <h2 className="mb-3 border-b border-ink/70 pb-1 text-base font-bold text-ink">{rep.title}</h2>
          {rep.sections.map((s) => (
            <div key={s.title} className="mb-5">
              <h3 className="mb-1 text-sm font-bold text-ink">{s.title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ink/60">
                      {s.head.map((h, i) => <th key={i} className={`px-2 py-1.5 font-semibold text-muted ${s.right.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r, ri) => (
                      <tr key={ri} className="border-b border-line">
                        {r.map((c, i) => (
                          <td key={i} className={`whitespace-pre px-2 py-1 ${s.right.includes(i) ? "text-right tabular-nums" : ""}`}>{typeof c === "number" ? rs(c) : c}</td>
                        ))}
                      </tr>
                    ))}
                    {!s.rows.length && (
                      <tr className="border-b border-line"><td colSpan={s.head.length} className="px-2 py-1 italic text-muted">Nothing in this period</td></tr>
                    )}
                  </tbody>
                  {s.foot && (
                    <tfoot>
                      <tr className="border-t border-ink/60 font-bold">
                        {s.foot.map((c, i) => <td key={i} className={`px-2 py-1.5 ${s.right.includes(i) ? "text-right tabular-nums" : ""}`}>{typeof c === "number" ? rs(c) : c}</td>)}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}
