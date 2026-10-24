"use client";

import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useStore, useCan } from "@/lib/store";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/types";
import { downloadCSV, fmtDate, money, shortMoney, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Stat, Table, toast } from "@/components/ui";

const PALETTE = ["#93bfea", "#f29cae", "#8bd4bd", "#ffd56b", "#b9a3dc", "#63c1ca", "#f5b48a", "#a8c97f", "#d9a0d0", "#9fb3c8", "#c9b79c", "#7fa7d9", "#e3a3a3"];

export default function ExpensesPage() {
  const can = useCan();
  if (!can("expenses.view")) return <NoAccess what="expenses" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const expenses = useStore((s) => s.expenses);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const me = useStore((s) => s.currentUserId);
  const months = [0, 1, 2].map((m) => format(subMonths(new Date(), m), "yyyy-MM"));
  const [month, setMonth] = useState(months[0]);
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<Expense | null>(null);

  const list = useMemo(() => expenses.filter((e) => (month === "all" || e.date.startsWith(month)) && (cat === "all" || e.category === cat)).sort((a, b) => b.date.localeCompare(a.date)), [expenses, month, cat]);
  const monthList = expenses.filter((e) => month === "all" || e.date.startsWith(month));
  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    monthList.forEach((e) => (m[e.category] = (m[e.category] ?? 0) + e.amount));
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthList]);
  const total = monthList.reduce((a, e) => a + e.amount, 0);
  const opex = monthList.filter((e) => !["Equipment (Capex)", "Owner Drawings", "Stock Purchases"].includes(e.category)).reduce((a, e) => a + e.amount, 0);
  const cash = monthList.filter((e) => e.paidFrom === "cash").reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Rent, bills, salaries and supplies. Everything here flows into the P&L and cash flow reports automatically."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCSV(`expenses-${month}.csv`, [["Date", "Category", "Description", "Vendor", "Paid from", "Amount"], ...list.map((e) => [e.date, e.category, e.description, e.vendor, e.paidFrom, e.amount])])}>Export</Button>
            {can("expenses.edit") && <Button icon={<Plus size={16} />} onClick={() => setEdit({ id: "", date: today(), category: "Utilities", description: "", vendor: "", amount: 0, paidFrom: "bank", createdBy: me ?? "" })}>Record expense</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="w-48" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{format(new Date(m + "-01"), "MMMM yyyy")}</option>)}
          <option value="all">All time</option>
        </Select>
        <Select className="w-60" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total paid out" value={money(total)} tone="rose" />
        <Stat label="Operating expenses (P&L)" value={money(opex)} sub="Excl. stock, capex & drawings" tone="sun" />
        <Stat label="Paid in cash" value={money(cash)} tone="mint" />
        <Stat label="Paid from bank" value={money(total - cash)} tone="sky" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card pad={false}>
          <Table head={["Date", "Category", "Description", "Vendor", "Paid from", "Amount", ""]}>
            {list.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap tabular">{fmtDate(e.date, "dd MMM")}</td>
                <td><Badge tone={e.category === "Salaries" || e.category.startsWith("EPF") ? "lilac" : e.category === "Rent" ? "rose" : e.category === "Utilities" ? "sky" : "gray"}>{e.category}</Badge></td>
                <td>{e.description}{e.payrollRunId && <span className="ml-1.5 text-[11px] text-muted">· from payroll</span>}</td>
                <td className="text-muted">{e.vendor}</td>
                <td className="capitalize text-muted">{e.paidFrom}</td>
                <td className="tabular font-bold">{money(e.amount)}</td>
                <td>
                  {can("expenses.edit") && (e.payrollRunId ? (
                    <span title="Posted by payroll — edit the payroll run instead" className="text-[#c3bcae]"><Lock size={14} /></span>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEdit(e)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm("Delete this expense?")) { remove("expenses", e.id, "Expenses", `${e.description} ${money(e.amount)}`); toast("Expense deleted"); } }} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-[#c24f69]"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="By category">
          <div style={{ height: Math.max(200, byCat.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={byCat} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#56627a" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "#f7f3ec" }} contentStyle={{ borderRadius: 12, border: "1px solid #ebe5da" }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16} label={{ position: "right", fontSize: 10, fill: "#8a92a5", formatter: (v: unknown) => shortMoney(Number(v)) }}>
                  {byCat.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? "Edit expense" : "Record expense"}
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit.description || edit.amount <= 0) return toast("Description and amount are required", "err"); const item = edit.id ? edit : { ...edit, id: uid("x") }; save("expenses", item, "Expenses", `${item.category}: ${item.description} ${money(item.amount)}`); toast("Expense saved"); setEdit(null); }}>Save</Button></>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date"><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Category"><Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as Expense["category"] })}>{EXPENSE_CATEGORIES.filter((c) => c !== "Salaries" && !c.startsWith("EPF")).map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Description" className="sm:col-span-2"><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="e.g. Electricity bill — October" /></Field>
            <Field label="Vendor / payee"><Input value={edit.vendor} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} /></Field>
            <Field label="Amount (Rs.)"><Input type="number" value={edit.amount || ""} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} /></Field>
            <Field label="Paid from"><Select value={edit.paidFrom} onChange={(e) => setEdit({ ...edit, paidFrom: e.target.value as Expense["paidFrom"] })}><option value="bank">Bank</option><option value="cash">Cash (petty cash)</option></Select></Field>
          </div>
          <p className="mt-4 text-xs text-muted">Salaries and EPF/ETF are posted here automatically when a payroll run is paid. Equipment purchases are treated as investing cash flow (not a P&L expense) and owner drawings as financing.</p>
        </Modal>
      )}
    </>
  );
}
