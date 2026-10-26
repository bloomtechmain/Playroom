"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { PayItem } from "@/lib/types";
import { money } from "@/lib/utils";
import { Input } from "./ui";

export const ALLOWANCE_SUGGESTIONS = ["Transport", "Meal", "Cost of living", "Attendance bonus", "Phone", "Performance bonus", "Festival bonus"];
export const DEDUCTION_SUGGESTIONS = ["Salary advance", "No-pay leave", "Staff loan instalment", "Welfare fund", "Union fee", "Uniform", "Stamp duty"];

/**
 * Edit a list of named amounts — an employee's allowances (each with its own EPF/ETF tick) or deductions.
 * Blank rows are allowed while typing; callers clean the list (lib/payroll.ts cleanItems) when saving.
 */
export function PayItemsEditor({ kind, items, onChange, epfDefault = true }: { kind: "allowance" | "deduction"; items: PayItem[]; onChange: (items: PayItem[]) => void; epfDefault?: boolean }) {
  const listId = useId();
  const allowance = kind === "allowance";
  const suggestions = (allowance ? ALLOWANCE_SUGGESTIONS : DEDUCTION_SUGGESTIONS).filter((s) => !items.some((x) => x.name.toLowerCase() === s.toLowerCase()));
  const set = (i: number, patch: Partial<PayItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = (name = "") => onChange([...items, allowance ? { name, amount: 0, epf: epfDefault } : { name, amount: 0 }]);
  const total = items.reduce((a, x) => a + (Number(x.amount) || 0), 0);

  return (
    <div>
      <datalist id={listId}>{(allowance ? ALLOWANCE_SUGGESTIONS : DEDUCTION_SUGGESTIONS).map((s) => <option key={s} value={s} />)}</datalist>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="h-9 flex-1" placeholder={allowance ? "e.g. Transport" : "e.g. Salary advance"} list={listId} value={x.name} onChange={(e) => set(i, { name: e.target.value })} />
              <Input className="h-9 w-32 text-right" type="number" min={0} placeholder="Rs." value={x.amount || ""} onChange={(e) => set(i, { amount: Number(e.target.value) })} />
              {allowance && (
                <label title="Include in the EPF/ETF base (e.g. cost of living); leave off for travelling and similar" className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-bold text-muted">
                  <input type="checkbox" className="h-4 w-4 accent-[#35609f]" checked={!!x.epf} onChange={(e) => set(i, { epf: e.target.checked })} /> EPF/ETF
                </label>
              )}
              <button type="button" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-[#c24f69]"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => add()} className="flex items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1 text-xs font-bold text-navy hover:bg-sky-soft">
          <Plus size={12} /> Add {allowance ? "allowance" : "deduction"}
        </button>
        {suggestions.slice(0, 4).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="rounded-lg bg-[#f6f2eb] px-2 py-1 text-xs text-muted hover:bg-sky-soft hover:text-navy">+ {s}</button>
        ))}
        {items.length > 0 && <span className="ml-auto text-xs text-muted">Total <b className="tabular text-ink">{money(total)}</b></span>}
      </div>
    </div>
  );
}
