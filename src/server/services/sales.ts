import "server-only";
import { format } from "date-fns";
import type { PayMethod, SaleItem } from "@/lib/types";
import { uid } from "@/lib/utils";
import { badRequest, HttpError } from "../http";
import type { Mut } from "../mutation";
import { chargeWallet } from "./money";

/** Prices, names and costs come from the product catalogue, not from the client. */
export async function recordSale(m: Mut, cart: Pick<SaleItem, "productId" | "qty">[], discount: number, method: PayMethod, tendered: number, customerId?: string) {
  if (!cart.length) throw badRequest("The cart is empty");
  if (discount > 0 && !m.actor.can("pos.discount")) throw new HttpError(403, "You don't have permission to give discounts");

  const items: SaleItem[] = [];
  for (const line of cart) {
    if (line.qty <= 0) continue;
    const p = await m.get("products", line.productId, "Product", { lock: true });
    if (!p.active) throw badRequest(`${p.name} is not on sale`);
    if (p.stock < line.qty) throw badRequest(`Only ${p.stock} ${p.name} in stock`);
    items.push({ productId: p.id, name: p.name, qty: line.qty, price: p.price, cost: p.cost });
    await m.update("products", p.id, { stock: p.stock - line.qty });
  }
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  if (discount < 0 || discount > subtotal) throw badRequest("Invalid discount");
  const total = subtotal - discount;
  if (method === "cash" && tendered < total) throw badRequest("Cash received is less than total");

  if (method === "wallet") {
    if (!customerId) throw badRequest("Pick a customer to pay by wallet");
    await chargeWallet(m, await m.get("customers", customerId, "Customer", { lock: true }), total);
  } else if (customerId) await m.get("customers", customerId, "Customer");

  await m.lock("sale-no");
  const prefix = `S${format(new Date(), "yyMMdd")}-`;
  const { n } = (await m.tx.one<{ n: number }>("SELECT count(*)::int AS n FROM sales WHERE no LIKE $1", [`${prefix}%`]))!;
  const shift = await m.myShift();
  const sale = await m.insert("sales", {
    id: uid("s"),
    no: `${prefix}${String(n + 1).padStart(3, "0")}`,
    at: new Date().toISOString(),
    items,
    subtotal,
    discount,
    total,
    method,
    tendered,
    userId: m.actor.id,
    shiftId: shift?.id,
    customerId,
  });
  await m.addTx({ type: "pos", method, amount: sale.total, ref: sale.id, refLabel: sale.no, customerId, discount });
  await m.log("POS", "Sale", `${sale.no} · ${items.length} item(s) · Rs. ${sale.total.toLocaleString()}${discount ? ` · discount Rs. ${discount}` : ""}`);
  return sale;
}
