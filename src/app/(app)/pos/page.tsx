"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingBasket, Trash2, X } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { PayMethod, Sale, SaleItem } from "@/lib/types";
import { cx, money } from "@/lib/utils";
import { Button, Card, Input, NoAccess, PageHeader, Tabs, toast } from "@/components/ui";
import { PaymentPicker } from "@/components/Payment";
import { CustomerPicker } from "@/components/CustomerPicker";
import ShiftGate from "@/components/ShiftGate";
import { PrintModal, SaleReceipt } from "@/components/Receipts";
import { saleDoc } from "@/lib/receiptDocs";

const CAT_COLOR: Record<string, string> = { Drinks: "bg-sky-soft", "Café": "bg-sun-soft", Snacks: "bg-rose-soft", "Socks & Gear": "bg-mint-soft", Toys: "bg-lilac-soft" };
const CAT_DOT: Record<string, string> = { Drinks: "bg-sky", "Café": "bg-sun", Snacks: "bg-rose", "Socks & Gear": "bg-mint", Toys: "bg-lilac" };

export default function POSPage() {
  const can = useCan();
  if (!can("pos.sell")) return <NoAccess what="the POS" />;
  return <POS />;
}

function POS() {
  const can = useCan();
  const products = useStore((s) => s.products);
  const customers = useStore((s) => s.customers);
  const recordSale = useStore((s) => s.recordSale);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [discType, setDiscType] = useState<"amt" | "pct">("pct");
  const [disc, setDisc] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [customerId, setCustomerId] = useState<string>();
  const [showCust, setShowCust] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const cats = ["All", ...Array.from(new Set(products.map((p) => p.category)))];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => p.active && (cat === "All" || p.category === cat) && (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase() === s));
  }, [products, cat, q]);

  const add = (id: string) => {
    const p = products.find((x) => x.id === id)!;
    const inCart = cart.find((i) => i.productId === id)?.qty ?? 0;
    if (inCart >= p.stock) return toast(`Only ${p.stock} ${p.name} in stock`, "err");
    setCart(inCart ? cart.map((i) => (i.productId === id ? { ...i, qty: i.qty + 1 } : i)) : [...cart, { productId: p.id, name: p.name, qty: 1, price: p.price, cost: p.cost }]);
  };
  const setQty = (id: string, qty: number) => setCart(qty <= 0 ? cart.filter((i) => i.productId !== id) : cart.map((i) => (i.productId === id ? { ...i, qty: Math.min(qty, products.find((p) => p.id === id)!.stock) } : i)));

  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const discount = Math.min(subtotal, discType === "pct" ? Math.round((subtotal * (Number(disc) || 0)) / 100) : Number(disc) || 0);
  const total = subtotal - discount;
  const customer = customers.find((c) => c.id === customerId);

  const checkout = async () => {
    if (!cart.length) return;
    if (method === "cash" && tendered && Number(tendered) < total) return toast("Cash received is less than total", "err");
    if (method === "wallet" && !customer) return toast("Pick a customer to pay by wallet", "err");
    const s = await recordSale(cart, discount, method, method === "cash" ? Number(tendered) || total : total, customerId);
    if (!s) return;
    setReceipt(s);
    setCart([]);
    setDisc("");
    setTendered("");
    setCustomerId(undefined);
    toast(`Sale ${s.no} complete`);
  };

  const scan = (e: React.FormEvent) => {
    e.preventDefault();
    const p = products.find((x) => x.sku.toLowerCase() === q.trim().toLowerCase());
    if (p) {
      add(p.id);
      setQ("");
    }
  };

  return (
    <>
      <PageHeader title="POS" subtitle="Café, snacks, grip socks and toys. Receipts print on the thermal printer." />
      <ShiftGate />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tabs value={cat} onChange={setCat} items={cats.map((c) => ({ value: c, label: c }))} />
            <form onSubmit={scan} className="relative min-w-[220px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input className="pl-9" placeholder="Search or scan SKU (e.g. PR-1001)" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((p) => {
              const out = p.stock <= 0;
              const n = cart.find((i) => i.productId === p.id)?.qty;
              return (
                <button
                  key={p.id}
                  disabled={out}
                  onClick={() => add(p.id)}
                  className={cx("relative flex min-h-[112px] flex-col justify-between rounded-2xl border border-line p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-40", CAT_COLOR[p.category] ?? "bg-white")}
                >
                  {n && <span className="absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-navy px-1.5 text-xs font-bold text-white">{n}</span>}
                  <div className="w-full">
                    <span className={cx("mb-1.5 block h-1.5 w-6 rounded-full", CAT_DOT[p.category] ?? "bg-sky")} />
                    <div className="pr-6 text-sm font-bold leading-snug">{p.name}</div>
                  </div>
                  <div className="mt-2 flex w-full items-end justify-between gap-2">
                    <span className="font-display text-lg font-semibold tabular">{money(p.price)}</span>
                    <span className={cx("text-[11px]", p.stock <= p.reorderAt ? "font-bold text-[#c24f69]" : "text-muted")}>{out ? "Out" : `${p.stock} left`}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="xl:sticky xl:top-20 xl:self-start" title={<span className="flex items-center gap-2"><ShoppingBasket size={17} /> Current sale</span>} action={cart.length > 0 && <button onClick={() => setCart([])} className="text-xs font-bold text-muted hover:text-[#c24f69]">Clear</button>}>
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Tap a product to add it.</p>
          ) : (
            <div className="-mx-5 max-h-[300px] overflow-y-auto scroll-thin">
              {cart.map((i) => (
                <div key={i.productId} className="flex items-center gap-2 border-b border-[#f2eee6] px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{i.name}</div>
                    <div className="text-xs text-muted tabular">{money(i.price)}</div>
                  </div>
                  <div className="flex items-center rounded-lg border border-line">
                    <button className="p-1.5 text-muted" onClick={() => setQty(i.productId, i.qty - 1)}><Minus size={13} /></button>
                    <span className="w-6 text-center text-sm font-bold tabular">{i.qty}</span>
                    <button className="p-1.5 text-muted" onClick={() => setQty(i.productId, i.qty + 1)}><Plus size={13} /></button>
                  </div>
                  <span className="w-20 text-right text-sm font-bold tabular">{money(i.qty * i.price)}</span>
                  <button className="text-muted hover:text-[#c24f69]" onClick={() => setQty(i.productId, 0)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {customer ? (
              <div className="flex items-center justify-between rounded-xl bg-sky-soft px-3 py-2 text-sm">
                <span><b>{customer.name}</b> · wallet {money(customer.wallet)}</span>
                <button onClick={() => setCustomerId(undefined)}><X size={14} /></button>
              </div>
            ) : showCust ? (
              <CustomerPicker value={customerId} onChange={(id) => { setCustomerId(id); setShowCust(false); }} />
            ) : (
              <button onClick={() => setShowCust(true)} className="text-sm font-bold text-navy hover:underline">+ Attach customer (optional)</button>
            )}
            {can("pos.discount") && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Discount</span>
                <div className="flex rounded-lg border border-line p-0.5 text-xs font-bold">
                  {(["pct", "amt"] as const).map((t) => (
                    <button key={t} onClick={() => setDiscType(t)} className={cx("rounded-md px-2 py-1", discType === t ? "bg-navy text-white" : "text-muted")}>{t === "pct" ? "%" : "Rs."}</button>
                  ))}
                </div>
                <Input type="number" className="h-8 flex-1" value={disc} onChange={(e) => setDisc(e.target.value)} />
              </div>
            )}
            <div className="space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular">{money(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-[#2f8f72]"><span>Discount</span><span className="tabular">-{money(discount)}</span></div>}
              <div className="flex items-end justify-between pt-1"><span className="font-bold">Total</span><span className="font-display text-3xl font-semibold tabular">{money(total)}</span></div>
            </div>
            <PaymentPicker method={method} onMethod={setMethod} total={total} tendered={tendered} onTendered={setTendered} walletBalance={customer?.wallet} />
            <Button size="lg" className="w-full" disabled={!cart.length} onClick={checkout}>
              Charge {money(total)}
            </Button>
          </div>
        </Card>
      </div>
      {receipt && (
        <PrintModal open onClose={() => setReceipt(null)} title={`Receipt ${receipt.no}`} doc={() => saleDoc(receipt)} autoPrint>
          <SaleReceipt s={receipt} />
        </PrintModal>
      )}
    </>
  );
}
