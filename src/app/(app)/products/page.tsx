"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Pencil, Plus, Printer, RotateCcw } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { Product, Sale } from "@/lib/types";
import { cx, fmtDT, methodLabel, money, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Stat, Table, Tabs, Toggle, toast } from "@/components/ui";
import { PrintModal, SaleReceipt } from "@/components/Receipts";
import { saleDoc } from "@/lib/receiptDocs";
import RefundDialog from "@/components/RefundDialog";

export default function ProductsPage() {
  const can = useCan();
  if (!can("products.edit") && !can("pos.sell")) return <NoAccess what="products" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const [tab, setTab] = useState<"products" | "sales">(can("products.edit") ? "products" : "sales");
  return (
    <>
      <PageHeader title="Products & Stock" subtitle="What you sell at the counter, what it costs you and what's running low." />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} items={[...(can("products.edit") ? [{ value: "products" as const, label: "Products" }] : []), { value: "sales", label: "Sales history" }]} /></div>
      {tab === "products" ? <Products /> : <Sales />}
    </>
  );
}

function Products() {
  const products = useStore((s) => s.products);
  const save = useStore((s) => s.save);
  const me = useStore((s) => s.currentUserId);
  const [edit, setEdit] = useState<Product | null>(null);
  const [recv, setRecv] = useState<Product | null>(null);
  const [qty, setQty] = useState("24");
  const [unitCost, setUnitCost] = useState("");
  const [asExpense, setAsExpense] = useState(true);
  const [low, setLow] = useState(false);
  const list = products.filter((p) => !low || p.stock <= p.reorderAt);
  const stockValue = products.reduce((a, p) => a + p.stock * p.cost, 0);

  const receive = () => {
    if (!recv) return;
    const n = Number(qty) || 0;
    const c = Number(unitCost) || recv.cost;
    save("products", { ...recv, stock: recv.stock + n, cost: c }, "Products", `Received ${n} × ${recv.name}`);
    if (asExpense) save("expenses", { id: uid("x"), date: today(), category: "Stock Purchases", description: `${n} × ${recv.name}`, vendor: "Supplier", amount: n * c, paidFrom: "cash", createdBy: me ?? "" }, "Expenses", `Stock purchase ${recv.name}`);
    toast(`Stock updated: ${recv.name} +${n}`);
    setRecv(null);
  };

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Products" value={products.filter((p) => p.active).length} tone="sky" />
        <Stat label="Low stock" value={products.filter((p) => p.stock <= p.reorderAt).length} tone="rose" />
        <Stat label="Stock value (cost)" value={money(stockValue)} tone="mint" />
        <Stat label="Avg. margin" value={`${Math.round((products.reduce((a, p) => a + (p.price - p.cost) / p.price, 0) / products.length) * 100)}%`} tone="sun" />
      </div>
      <Card
        pad={false}
        title={<span className="flex items-center gap-3">Catalogue <Toggle checked={low} onChange={setLow} label={<span className="text-xs text-muted">Low stock only</span>} /></span>}
        action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ id: "", name: "", category: "Snacks", sku: `PR-${1001 + products.length}`, price: 0, cost: 0, stock: 0, reorderAt: 8, active: true })}>Add product</Button>}
      >
        <Table head={["Product", "SKU", "Category", "Price", "Cost", "Margin", "Stock", ""]}>
          {list.map((p) => (
            <tr key={p.id} className={cx(!p.active && "opacity-50")}>
              <td className="font-bold">{p.name}</td>
              <td className="font-mono text-xs text-muted">{p.sku}</td>
              <td className="text-muted">{p.category}</td>
              <td className="tabular">{money(p.price)}</td>
              <td className="tabular text-muted">{money(p.cost)}</td>
              <td className="tabular">{p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0}%</td>
              <td>{p.stock <= p.reorderAt ? <Badge tone="rose">{p.stock} · reorder</Badge> : <span className="tabular">{p.stock}</span>}</td>
              <td>
                <div className="flex justify-end gap-1">
                  <button title="Receive stock" onClick={() => { setRecv(p); setUnitCost(String(p.cost)); }} className="rounded-lg p-1.5 text-muted hover:bg-mint-soft hover:text-[#2f8f72]"><PackagePlus size={15} /></button>
                  <button title="Edit" onClick={() => setEdit(p)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : "New product"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => { if (!edit.name) return; const item = edit.id ? edit : { ...edit, id: uid("p") }; save("products", item, "Products", item.name); toast("Product saved"); setEdit(null); }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="SKU / barcode"><Input value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></Field>
            <Field label="Category">
              <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {["Drinks", "Café", "Snacks", "Socks & Gear", "Toys"].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Selling price (Rs.)"><Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></Field>
            <Field label="Cost price (Rs.)"><Input type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></Field>
            <Field label="Stock on hand"><Input type="number" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></Field>
            <Field label="Reorder level"><Input type="number" value={edit.reorderAt} onChange={(e) => setEdit({ ...edit, reorderAt: Number(e.target.value) })} /></Field>
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Show on POS" />
          </div>
        </Modal>
      )}
      {recv && (
        <Modal open onClose={() => setRecv(null)} title={`Receive stock · ${recv.name}`} footer={<><Button variant="secondary" onClick={() => setRecv(null)}>Cancel</Button><Button onClick={receive}>Add to stock</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity received"><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Unit cost (Rs.)"><Input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
          </div>
          <div className="mt-4"><Toggle checked={asExpense} onChange={setAsExpense} label={`Record ${money((Number(qty) || 0) * (Number(unitCost) || 0))} as a stock purchase (cash flow)`} /></div>
        </Modal>
      )}
    </>
  );
}

function Sales() {
  const can = useCan();
  const sales = useStore((s) => s.sales);
  const users = useStore((s) => s.users);
  const [print, setPrint] = useState<Sale | null>(null);
  const [refund, setRefund] = useState<Sale | null>(null);
  const [limit, setLimit] = useState(40);
  const list = useMemo(() => [...sales].sort((a, b) => b.at.localeCompare(a.at)), [sales]);
  return (
    <Card pad={false}>
      <Table head={["Receipt", "Time", "Items", "Cashier", "Method", "Discount", "Total", ""]}>
        {list.slice(0, limit).map((s) => (
          <tr key={s.id}>
            <td className="font-mono text-xs font-bold">{s.no}</td>
            <td className="tabular">{fmtDT(s.at)}</td>
            <td className="max-w-[260px] truncate text-muted">{s.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
            <td>{users.find((u) => u.id === s.userId)?.name.split(" ")[0]}</td>
            <td className="text-muted">{methodLabel[s.method]}</td>
            <td className="tabular">{s.discount ? money(s.discount) : "—"}</td>
            <td className="tabular font-bold">{money(s.total)}{s.refunded ? <div className="text-[11px] font-normal text-[#c24f69]">refunded {money(s.refunded)}</div> : null}</td>
            <td>
              <div className="flex justify-end gap-1">
                <button title="Reprint" onClick={() => setPrint(s)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Printer size={15} /></button>
                {can("refunds.request") && (s.refunded ?? 0) < s.total && <button title="Refund" onClick={() => setRefund(s)} className="rounded-lg p-1.5 text-muted hover:bg-rose-soft hover:text-[#c24f69]"><RotateCcw size={15} /></button>}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {list.length > limit && <div className="border-t border-line p-3 text-center"><Button variant="ghost" onClick={() => setLimit(limit + 80)}>Show more</Button></div>}
      {print && <PrintModal open onClose={() => setPrint(null)} title={`Receipt ${print.no}`} doc={() => saleDoc(print)} autoPrint><SaleReceipt s={print} /></PrintModal>}
      {refund && <RefundDialog open onClose={() => setRefund(null)} target="sale" targetId={refund.id} label={refund.no} max={refund.total - (refund.refunded ?? 0)} method={refund.method} />}
    </Card>
  );
}
