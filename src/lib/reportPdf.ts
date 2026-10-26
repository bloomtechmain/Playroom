import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type CellHookData, type RowInput } from "jspdf-autotable";
import { format } from "date-fns";
import type { Settings } from "./types";

/**
 * Standard A4 report documents (real text PDFs, not screenshots): letterhead, title and period,
 * accounting-style tables, a running header on later pages and "Page x of y" footers.
 */

const M = 15; // page margin, mm
const NAVY: [number, number, number] = [36, 57, 95];
const INK: [number, number, number] = [33, 37, 41];
const MUTED: [number, number, number] = [110, 116, 128];
const RULE: [number, number, number] = [200, 196, 188];
const SHADE: [number, number, number] = [246, 243, 238];

/** The built-in PDF fonts only cover Latin-1 — swap the few symbols the app uses. */
const clean = (s: string) => s.replace(/→/g, "->").replace(/[★✓]/g, "*").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");

/** Accounting number: 1,234,567.00 — negatives in brackets, zero as a dash. */
export function amt(n: number, opts: { decimals?: number; neg?: boolean } = {}) {
  const d = opts.decimals ?? 2;
  if (!n) return "-";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return n < 0 || opts.neg ? `(${s})` : s;
}
export const count = (n: number) => (n ? n.toLocaleString("en-US") : "-");
export const pctStr = (n: number) => `${(n * 100).toFixed(1)}%`;

export interface ReportMeta {
  title: string;
  /** e.g. "1 October 2026 to 25 October 2026" */
  period?: string;
  preparedBy?: string;
  landscape?: boolean;
}

export type StatementRow =
  | { kind: "section"; label: string }
  | { kind: "line" | "subline" | "subtotal" | "total" | "grand"; label: string; values: number[]; neg?: boolean };

export const periodLabel = (from: string, to: string) =>
  `${format(new Date(from + "T00:00"), "d MMMM yyyy")} to ${format(new Date(to + "T00:00"), "d MMMM yyyy")}`;

export class ReportPdf {
  readonly doc: jsPDF;
  private y: number;
  private readonly w: number;

  constructor(
    private readonly biz: Pick<Settings, "businessName" | "address" | "phone" | "email">,
    private readonly meta: ReportMeta,
  ) {
    this.doc = new jsPDF({ unit: "mm", format: "a4", orientation: meta.landscape ? "landscape" : "portrait" });
    this.w = this.doc.internal.pageSize.getWidth();
    this.y = this.letterhead();
  }

  private letterhead() {
    const d = this.doc;
    d.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(16).text(clean(this.biz.businessName || "The Playroom"), M, M + 4);
    d.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(8.5);
    const contact = [this.biz.address, [this.biz.phone, this.biz.email].filter(Boolean).join("  ·  ")].filter(Boolean).map(clean);
    contact.forEach((l, i) => d.text(l, M, M + 9.5 + i * 4));
    d.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(13).text(clean(this.meta.title).toUpperCase(), this.w - M, M + 4, { align: "right" });
    d.setFont("helvetica", "normal").setFontSize(9);
    if (this.meta.period) d.text(clean(this.meta.period), this.w - M, M + 9.5, { align: "right" });
    d.setTextColor(...MUTED).setFontSize(8).text(`Generated ${format(new Date(), "d MMM yyyy, h:mm a")}`, this.w - M, M + (this.meta.period ? 13.5 : 9.5), { align: "right" });
    const bottom = M + Math.max(9.5 + contact.length * 4, 16);
    d.setDrawColor(...NAVY).setLineWidth(0.6).line(M, bottom, this.w - M, bottom);
    return bottom + 7;
  }

  /** Small running header on pages after the first, and the footer on every page. Call once, before saving. */
  private finish() {
    const d = this.doc;
    const pages = d.getNumberOfPages();
    const h = d.internal.pageSize.getHeight();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i);
      if (i > 1) {
        d.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(8);
        d.text(clean(`${this.biz.businessName} — ${this.meta.title}${this.meta.period ? ` — ${this.meta.period}` : ""}`), M, M - 4);
        d.setDrawColor(...RULE).setLineWidth(0.2).line(M, M - 2.5, this.w - M, M - 2.5);
      }
      d.setDrawColor(...RULE).setLineWidth(0.2).line(M, h - 12, this.w - M, h - 12);
      d.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(7.5);
      d.text(clean(`${this.meta.preparedBy ? `Prepared by ${this.meta.preparedBy}  ·  ` : ""}${this.biz.businessName} management system`), M, h - 8);
      d.text(`Page ${i} of ${pages}`, this.w - M, h - 8, { align: "right" });
    }
  }

  private room(mm: number) {
    if (this.y + mm > this.doc.internal.pageSize.getHeight() - 20) {
      this.doc.addPage();
      this.y = M + 4;
    }
  }

  private get lastY() {
    return (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? this.y;
  }

  heading(text: string) {
    this.room(14);
    this.doc.setTextColor(...NAVY).setFont("helvetica", "bold").setFontSize(10.5).text(clean(text), M, this.y);
    this.y += 3;
    return this;
  }

  paragraph(text: string, opts: { size?: number; muted?: boolean } = {}) {
    const d = this.doc;
    d.setFont("helvetica", "normal").setFontSize(opts.size ?? 8.5).setTextColor(...(opts.muted === false ? INK : MUTED));
    const lines = d.splitTextToSize(clean(text), this.w - 2 * M) as string[];
    this.room(lines.length * 4 + 2);
    d.text(lines, M, this.y);
    this.y += lines.length * 3.8 + 3;
    return this;
  }

  /** A row of headline figures in boxes. */
  kpis(items: { label: string; value: string }[]) {
    const d = this.doc;
    const gap = 3;
    const bw = (this.w - 2 * M - gap * (items.length - 1)) / items.length;
    this.room(18);
    items.forEach((k, i) => {
      const x = M + i * (bw + gap);
      d.setFillColor(...SHADE).setDrawColor(...RULE).setLineWidth(0.2).roundedRect(x, this.y, bw, 14, 1.5, 1.5, "FD");
      d.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(7.5).text(clean(k.label), x + 3, this.y + 5);
      d.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(11).text(clean(k.value), x + 3, this.y + 11);
    });
    this.y += 23;
    return this;
  }

  /** A financial statement: label column + one amount column per period, with section/subtotal/total styling. */
  statement(columns: string[], rows: StatementRow[]) {
    const body: RowInput[] = rows.map((r) =>
      r.kind === "section"
        ? [{ content: clean(r.label).toUpperCase(), colSpan: columns.length + 1, styles: { fontStyle: "bold", textColor: MUTED, fontSize: 7.5, cellPadding: { top: 4, bottom: 1, left: 1.5, right: 1.5 } } } as CellDef]
        : [clean(r.label), ...r.values.map((v) => amt(v, { neg: r.neg }))],
    );
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: M, right: M, top: M + 2, bottom: 18 },
      theme: "plain",
      head: [["", ...columns]],
      body,
      styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 } },
      headStyles: { fontStyle: "bold", fontSize: 8, textColor: MUTED, halign: "right", lineWidth: { bottom: 0.3 }, lineColor: INK },
      columnStyles: { 0: { halign: "left", cellWidth: "auto" }, ...Object.fromEntries(columns.map((_, i) => [i + 1, { halign: "right", cellWidth: 34 }])) },
      didParseCell: (h: CellHookData) => {
        if (h.section !== "body") return;
        const r = rows[h.row.index];
        if (r.kind === "section") return;
        if (h.column.index === 0) h.cell.styles.cellPadding = { top: 1.3, bottom: 1.3, left: r.kind === "subline" ? 9 : r.kind === "line" ? 5 : 1.5, right: 1.5 };
        if (r.kind === "subline") h.cell.styles.textColor = MUTED;
        if (r.kind === "subtotal" || r.kind === "total" || r.kind === "grand") h.cell.styles.fontStyle = "bold";
        if (r.kind === "total" || r.kind === "grand") h.cell.styles.fillColor = SHADE;
        if (h.column.index > 0 && (r.kind === "subtotal" || r.kind === "total" || r.kind === "grand")) {
          h.cell.styles.lineWidth = { top: 0.25 };
          h.cell.styles.lineColor = INK;
        }
      },
      didDrawCell: (h: CellHookData) => {
        // double rule under the final figure, as on printed accounts
        if (h.section !== "body" || h.column.index === 0 || rows[h.row.index].kind !== "grand") return;
        const y = h.cell.y + h.cell.height;
        this.doc.setDrawColor(...INK).setLineWidth(0.25);
        this.doc.line(h.cell.x + 2, y - 0.2, h.cell.x + h.cell.width, y - 0.2);
        this.doc.line(h.cell.x + 2, y + 0.6, h.cell.x + h.cell.width, y + 0.6);
      },
    });
    this.y = this.lastY + 7;
    return this;
  }

  /** A data table. `align` marks right-aligned (number) columns; `foot` is a totals row. */
  table(head: string[], body: (string | number)[][], opts: { align?: ("l" | "r" | "c")[]; foot?: (string | number)[]; widths?: (number | "auto")[] } = {}) {
    const halign = (i: number) => ({ l: "left", r: "right", c: "center" } as const)[opts.align?.[i] ?? "l"];
    const cell = (v: string | number) => (typeof v === "number" ? amt(v) : clean(v));
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: M, right: M, top: M + 2, bottom: 18 },
      theme: "plain",
      head: [head.map(clean)],
      body: body.length ? body.map((r) => r.map(cell)) : [[{ content: "Nothing in this period", colSpan: head.length, styles: { textColor: MUTED, fontStyle: "italic" } } as CellDef]],
      foot: opts.foot ? [opts.foot.map(cell)] : undefined,
      showFoot: "lastPage",
      styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 1.5, right: 1.5 }, overflow: "linebreak" },
      headStyles: { fontStyle: "bold", fontSize: 8, textColor: MUTED, lineWidth: { bottom: 0.3 }, lineColor: INK },
      footStyles: { fontStyle: "bold", lineWidth: { top: 0.3 }, lineColor: INK, fillColor: SHADE },
      alternateRowStyles: { fillColor: [251, 250, 247] },
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: halign(i), ...(opts.widths?.[i] != null ? { cellWidth: opts.widths[i] } : {}) }])),
      didParseCell: (h: CellHookData) => {
        if (h.section === "head" || h.section === "foot") h.cell.styles.halign = halign(h.column.index);
      },
    });
    this.y = this.lastY + 7;
    return this;
  }

  /** Two-column label/value list (e.g. employee details on a payslip). */
  details(pairs: [string, string][], columns = 2) {
    const rows: string[][] = [];
    for (let i = 0; i < pairs.length; i += columns) rows.push(pairs.slice(i, i + columns).flatMap(([l, v]) => [clean(l), clean(v)]));
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: M, right: M },
      theme: "plain",
      body: rows,
      styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: 1.2 },
      columnStyles: Object.fromEntries(Array.from({ length: columns * 2 }, (_, i) => [i, i % 2 === 0 ? { textColor: MUTED, cellWidth: 28 } : { fontStyle: "bold" }])),
    });
    this.y = this.lastY + 9;
    return this;
  }

  /** Signature lines at the end of the document. */
  signatures(labels: string[]) {
    this.room(28);
    this.y += 14;
    const d = this.doc;
    const bw = (this.w - 2 * M - 10 * (labels.length - 1)) / labels.length;
    labels.forEach((l, i) => {
      const x = M + i * (bw + 10);
      d.setDrawColor(...INK).setLineWidth(0.2).line(x, this.y, x + bw, this.y);
      d.setTextColor(...MUTED).setFont("helvetica", "normal").setFontSize(8).text(clean(l), x, this.y + 4);
      d.text("Date:", x, this.y + 8);
    });
    this.y += 12;
    return this;
  }

  save(fileName: string) {
    this.finish();
    this.doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  }

  /** The finished file, e.g. for tests. */
  output() {
    this.finish();
    return this.doc.output("arraybuffer");
  }
}
