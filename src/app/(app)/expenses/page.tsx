"use client";

import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { FileText, Lock, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useStore, useCan } from "@/lib/store";
import { useNewReport } from "@/lib/useNewReport";
import type { Expense } from "@/lib/types";
import { EXPENSE_SECTIONS, expenseCategories, sectionLabel, sectionOf, type ExpenseCategoryDef, type ExpenseSection } from "@/lib/accounting";
import { cx, downloadCSV, fmtDate, money, shortMoney, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Stat, Table, Toggle, toast, type Tone } from "@/components/ui";

const PALETTE = ["#93bfea", "#f29cae", "#8bd4bd", "#ffd56b", "#b9a3dc", "#63c1ca", "#f5b48a", "#a8c97f", "#d9a0d0", "#9fb3c8", "#c9b79c", "#7fa7d9", "#e3a3a3"];

const NEW_CAT = "__new";
const SECTION_TONE: Record<ExpenseSection, Tone> = { cost_of_sales: "sun", staff: "lilac", premises: "rose", selling: "teal", admin: "sky", finance: "gray", tax: "gray", inventory: "mint", capex: "gray", drawings: "gray" };

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
  const settings = useStore((s) => s.settings);
  const cats = useMemo(() => expenseCategories(settings), [settings]);
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  // salaries and EPF/ETF are posted by payroll, not recorded by hand
  const offered = cats.filter((c) => c.active && c.name !== "Salaries" && c.name !== "EPF / ETF (Employer)");
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
  const inPnl = monthList.filter((e) => EXPENSE_SECTIONS.find((s) => s.key === sectionOf(cats, e.category))?.pnl).reduce((a, e) => a + e.amount, 0);
  const cash = monthList.filter((e) => e.paidFrom === "cash").reduce((a, e) => a + e.amount, 0);

  const newReport = useNewReport();
  const downloadPdf = async () => {
    const period = month === "all" ? "All recorded expenses" : format(new Date(month + "-01"), "MMMM yyyy");
    const r = await newReport("Expense report", cat === "all" ? period : `${period} — ${cat}`);
    const listTotal = list.reduce((a, e) => a + e.amount, 0);
    r.kpis([
      { label: "Total paid out", value: money(listTotal) },
      { label: "In the P&L", value: money(list.filter((e) => EXPENSE_SECTIONS.find((s) => s.key === sectionOf(cats, e.category))?.pnl).reduce((a, e) => a + e.amount, 0)) },
      { label: "Paid in cash", value: money(list.filter((e) => e.paidFrom === "cash").reduce((a, e) => a + e.amount, 0)) },
      { label: "Paid from bank", value: money(list.filter((e) => e.paidFrom === "bank").reduce((a, e) => a + e.amount, 0)) },
    ]);
    r.heading("Summary by category");
    const summary = EXPENSE_SECTIONS.flatMap((s) => {
      const names = Array.from(new Set(list.filter((e) => sectionOf(cats, e.category) === s.key).map((e) => e.category))).sort();
      return names.map((n) => {
        const items = list.filter((e) => e.category === n);
        return [n, s.label, String(items.length), items.reduce((a, e) => a + e.amount, 0)] as (string | number)[];
      });
    });
    r.table(["Category", "P&L section", "Items", "Amount (Rs.)"], summary, { align: ["l", "l", "r", "r"], foot: ["Total", "", String(list.length), listTotal] });
    r.heading("Expenses");
    r.table(
      ["Date", "Category", "Description", "Vendor / payee", "Paid from", "Amount (Rs.)"],
      [...list].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [fmtDate(e.date, "d MMM yyyy"), e.category, e.description + (e.payrollRunId ? " (payroll)" : ""), e.vendor, e.paidFrom === "cash" ? "Cash" : "Bank", e.amount]),
      { align: ["l", "l", "l", "l", "l", "r"], foot: ["Total", "", "", "", "", listTotal] },
    );
    r.signatures(["Prepared by", "Approved by"]);
    r.save(`expense-report_${month}${cat === "all" ? "" : `_${cat.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}`);
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Rent, bills, salaries and supplies. Everything here flows into the P&L and cash flow reports automatically."
        actions={
          <>
            <Button variant="secondary" icon={<FileText size={16} />} onClick={() => downloadPdf().catch(() => toast("Couldn't create the PDF", "err"))}>PDF</Button>
            <Button variant="secondary" onClick={() => downloadCSV(`expenses-${month}.csv`, [["Date", "Category", "Description", "Vendor", "Paid from", "Amount"], ...list.map((e) => [e.date, e.category, e.description, e.vendor, e.paidFrom, e.amount])])}>Export</Button>
            {can("expenses.edit") && <Button variant="secondary" icon={<Tags size={16} />} onClick={() => setManaging(true)}>Categories</Button>}
            {can("expenses.edit") && <Button icon={<Plus size={16} />} onClick={() => { setAdding(false); setEdit({ id: "", date: today(), category: "", description: "", vendor: "", amount: 0, paidFrom: "bank", createdBy: me ?? "" }); }}>Record expense</Button>}
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
          {cats.map((c) => <option key={c.name}>{c.name}</option>)}
        </Select>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total paid out" value={money(total)} tone="rose" />
        <Stat label="In the P&L" value={money(inPnl)} sub="Excl. stock, equipment & drawings" tone="sun" />
        <Stat label="Paid in cash" value={money(cash)} tone="mint" />
        <Stat label="Paid from bank" value={money(total - cash)} tone="sky" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card pad={false}>
          <Table head={["Date", "Category", "Description", "Vendor", "Paid from", "Amount", ""]}>
            {list.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap tabular">{fmtDate(e.date, "dd MMM")}</td>
                <td><Badge tone={SECTION_TONE[sectionOf(cats, e.category)]}>{e.category}</Badge><div className="mt-0.5 text-[11px] text-muted">{sectionLabel(sectionOf(cats, e.category))}</div></td>
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
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit.category) return toast("Choose a category", "err"); if (!edit.description || edit.amount <= 0) return toast("Description and amount are required", "err"); const item = edit.id ? edit : { ...edit, id: uid("x") }; save("expenses", item, "Expenses", `${item.category}: ${item.description} ${money(item.amount)}`); toast("Expense saved"); setEdit(null); }}>Save</Button></>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date"><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Category" hint={edit.category ? `Shows in the P&L under ${sectionLabel(sectionOf(cats, edit.category))}` : undefined}>
              <Select value={edit.category} onChange={(e) => (e.target.value === NEW_CAT ? setAdding(true) : setEdit({ ...edit, category: e.target.value }))}>
                <option value="">Choose a category…</option>
                {EXPENSE_SECTIONS.map((s) => {
                  const list = offered.filter((c) => c.section === s.key);
                  return list.length ? <optgroup key={s.key} label={s.label}>{list.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup> : null;
                })}
                {edit.category && !offered.some((c) => c.name === edit.category) && <option value={edit.category}>{edit.category}</option>}
                <option value={NEW_CAT}>+ New category…</option>
              </Select>
            </Field>
            {adding && <div className="sm:col-span-2"><NewCategory cats={cats} onAdded={(n) => { setEdit({ ...edit, category: n }); setAdding(false); }} onCancel={() => setAdding(false)} /></div>}
            <Field label="Description" className="sm:col-span-2"><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="e.g. Electricity bill — October" /></Field>
            <Field label="Vendor / payee"><Input value={edit.vendor} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} /></Field>
            <Field label="Amount (Rs.)"><Input type="number" value={edit.amount || ""} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} /></Field>
            <Field label="Paid from"><Select value={edit.paidFrom} onChange={(e) => setEdit({ ...edit, paidFrom: e.target.value as Expense["paidFrom"] })}><option value="bank">Bank</option><option value="cash">Cash (petty cash)</option></Select></Field>
          </div>
          <p className="mt-4 text-xs text-muted">Salaries and EPF/ETF are posted here automatically when a payroll run is paid. Where each category appears in the P&amp;L is set under Categories.</p>
        </Modal>
      )}
      {managing && <Categories cats={cats} expenses={expenses} onClose={() => setManaging(false)} />}
    </>
  );
}

/** Add a category: a name and where it goes in the P&L. Returns the saved name. */
function NewCategory({ cats, onAdded, onCancel }: { cats: ExpenseCategoryDef[]; onAdded: (name: string) => void; onCancel?: () => void }) {
  const setSettings = useStore((s) => s.setSettings);
  const [name, setName] = useState("");
  const [section, setSection] = useState<ExpenseSection>("admin");
  const add = async () => {
    const n = name.trim();
    if (!n) return toast("Enter a category name", "err");
    if (cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) return toast(`"${n}" already exists`, "err");
    if (!(await setSettings({ expenseCategories: [...cats, { name: n, section, active: true }] }, `Added expense category ${n} (${sectionLabel(section)})`))) return;
    toast(`Category "${n}" added`);
    setName("");
    onAdded(n);
  };
  return (
    <div className="rounded-xl border border-dashed border-line bg-[#faf7f1] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New category name"><Input autoFocus value={name} placeholder="e.g. Insurance" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} /></Field>
        <Field label="Shows in the P&L under" hint={EXPENSE_SECTIONS.find((s) => s.key === section)?.hint}>
          <Select value={section} onChange={(e) => setSection(e.target.value as ExpenseSection)}>
            {EXPENSE_SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button size="sm" icon={<Plus size={14} />} onClick={add}>Add category</Button>
      </div>
    </div>
  );
}

/** The category list: where each one goes in the P&L, and which are offered when recording an expense. */
function Categories({ cats, expenses, onClose }: { cats: ExpenseCategoryDef[]; expenses: Expense[]; onClose: () => void }) {
  const setSettings = useStore((s) => s.setSettings);
  const used = (n: string) => expenses.filter((e) => e.category === n).length;
  const change = (name: string, patch: Partial<ExpenseCategoryDef>, detail: string) =>
    setSettings({ expenseCategories: cats.map((c) => (c.name === name ? { ...c, ...patch } : c)) }, detail);
  return (
    <Modal open onClose={onClose} title="Expense categories" width="max-w-3xl" footer={<Button onClick={onClose}>Done</Button>}>
      <p className="mb-3 text-sm text-muted">Each category belongs to a line of the profit &amp; loss statement. Changing a category&apos;s line moves all of its expenses in the report, including past ones.</p>
      <div className="overflow-x-auto">
        <Table head={["Category", "Shows in the P&L under", "Expenses", "Offered"]}>
          {EXPENSE_SECTIONS.flatMap((s) => cats.filter((c) => c.section === s.key)).map((c) => (
            <tr key={c.name} className={cx(!c.active && "opacity-50")}>
              <td className="font-bold">{c.name}{c.system && <span title="Posted automatically by payroll or stock — can't be changed" className="ml-1.5 inline-block align-middle text-[#c3bcae]"><Lock size={12} /></span>}</td>
              <td>
                <Select className="h-8 w-64" value={c.section} disabled={c.system} onChange={(e) => change(c.name, { section: e.target.value as ExpenseSection }, `Expense category ${c.name} → ${sectionLabel(e.target.value as ExpenseSection)}`)}>
                  {EXPENSE_SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </Select>
              </td>
              <td className="tabular text-muted">{used(c.name)}</td>
              <td>{!c.system && <Toggle checked={c.active} onChange={(v) => change(c.name, { active: v }, `Expense category ${c.name} ${v ? "shown" : "hidden"}`)} label={<span className="text-xs text-muted">{c.active ? "Yes" : "Hidden"}</span>} />}</td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="mt-4"><NewCategory cats={cats} onAdded={() => undefined} /></div>
      <p className="mt-2 text-xs text-muted">Hidden categories are no longer offered for new expenses; expenses already recorded keep them and stay in the report.</p>
    </Modal>
  );
}
