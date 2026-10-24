import "server-only";
import type { Customer, PayMethod, Settings } from "@/lib/types";
import { uid } from "@/lib/utils";
import { badRequest } from "../http";
import type { Mut } from "../mutation";

/** Take money from a customer's prepaid wallet (the row must have been read with a lock). */
export async function chargeWallet(m: Mut, cust: Customer, amount: number) {
  if (amount <= 0) return;
  if (cust.wallet < amount) throw badRequest(`Wallet balance is too low (Rs. ${cust.wallet.toLocaleString()})`);
  cust.wallet -= amount;
  await m.update("customers", cust.id, { wallet: cust.wallet });
}

export async function creditWallet(m: Mut, customerId: string, amount: number) {
  const c = await m.get("customers", customerId, "Customer", { lock: true });
  await m.update("customers", c.id, { wallet: c.wallet + amount });
}

export async function earnAndRedeemPoints(m: Mut, customerId: string, redeemed: number, spent: number, settings: Settings) {
  const c = await m.get("customers", customerId, "Customer", { lock: true });
  const points = c.points - redeemed + Math.floor((spent / 100) * settings.pointsPer100);
  if (points !== c.points) await m.update("customers", c.id, { points: Math.max(0, points) });
}

export async function openShift(m: Mut, float: number) {
  await m.lock(`shift:${m.actor.id}`);
  if (await m.myShift()) throw badRequest("You already have a shift open");
  const sh = await m.insert("shifts", { id: uid("sh"), userId: m.actor.id, openedAt: new Date().toISOString(), openingFloat: float, notes: "" });
  await m.log("Shifts", "Opened shift", `Opening float Rs. ${float.toLocaleString()}`);
  return sh;
}

export async function closeShift(m: Mut, counted: number, notes: string) {
  const sh = await m.myShift();
  if (!sh) throw badRequest("You don't have an open shift");
  await m.update("shifts", sh.id, { closedAt: new Date().toISOString(), countedCash: counted, notes });
  await m.log("Shifts", "Closed shift", `Counted cash Rs. ${counted.toLocaleString()}`);
  return sh.id;
}

export async function topUpWallet(m: Mut, customerId: string, amount: number, method: PayMethod) {
  if (method === "wallet") throw badRequest("Choose how the customer is paying for the top-up");
  const c = await m.get("customers", customerId, "Customer", { lock: true });
  await m.update("customers", c.id, { wallet: c.wallet + amount });
  await m.addTx({ type: "topup", method, amount, ref: customerId, refLabel: "Wallet top-up", customerId, discount: 0 });
  await m.log("Customers", "Wallet top-up", `${c.name} · Rs. ${amount.toLocaleString()}`);
}
