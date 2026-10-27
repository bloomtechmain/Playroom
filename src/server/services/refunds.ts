import "server-only";
import { REFUND_REASONS, type RefundRequest, type TxType } from "@/lib/types";
import { uid } from "@/lib/utils";
import { actorOf, type Actor } from "../auth";
import { badRequest, HttpError } from "../http";
import type { Mut } from "../mutation";
import { checkCredentials } from "./account";
import { creditWallet } from "./money";
import { alertRefundDecision, alertRefundRequest } from "../whatsapp/messages";

export type NewRefund = Omit<RefundRequest, "id" | "at" | "requestedBy" | "status">;

/** Money received on the target that hasn't been refunded yet, and who the customer is. */
async function refundable(m: Mut, target: RefundRequest["target"], targetId: string) {
  if (target === "ticket") {
    const t = await m.get("tickets", targetId, "Ticket");
    return { max: t.paid, customerId: t.customerId };
  }
  if (target === "sale") {
    const x = await m.get("sales", targetId, "Sale");
    return { max: x.total - (x.refunded ?? 0), customerId: x.customerId };
  }
  const b = await m.get("bookings", targetId, "Booking");
  return { max: b.paid, customerId: b.customerId };
}

/** Requests still waiting for a manager count against what can be refunded. */
async function pendingFor(m: Mut, targetId: string) {
  const r = await m.tx.one<{ total: number }>("SELECT coalesce(sum(amount), 0) AS total FROM refunds WHERE target_id = $1 AND status = 'pending'", [targetId]);
  return r?.total ?? 0;
}

export async function requestRefund(m: Mut, r: NewRefund) {
  if (!r.reason.trim()) throw badRequest("Please give a reason — it goes into the audit log");
  await m.lock(`refund:${r.targetId}`);
  const { max: paid } = await refundable(m, r.target, r.targetId);
  const max = paid - (await pendingFor(m, r.targetId));
  if (r.amount <= 0) throw badRequest("Enter a refund amount");
  if (max <= 0) throw badRequest(paid > 0 ? "Refunds for the full amount are already waiting for approval" : "Nothing left to refund on this payment");
  if (r.amount > max) throw badRequest(`At most Rs. ${max.toLocaleString()} can be refunded`);
  const req = await m.insert("refunds", { ...r, maxAmount: max, id: uid("rf"), at: new Date().toISOString(), requestedBy: m.actor.id, status: "pending" });
  const why = REFUND_REASONS.find((x) => x.value === req.category)?.label;
  await m.log("Refunds", "Requested refund", `${req.label} · Rs. ${req.amount.toLocaleString()} — ${why ? `${why}: ` : ""}${req.reason}`);
  return req;
}

/** WhatsApp the approvers about a request that is still waiting (call once the request is settled as pending). */
export async function alertIfPending(m: Mut, id: string) {
  const r = await m.get("refunds", id, "Refund request");
  if (r.status === "pending") await alertRefundRequest(m.tx, await m.settings(), r, m.actor.name, m.actor.id);
}

/**
 * Approve or reject. `by` is the approver when a manager signs off at the counter — the requester is
 * standing right there then, so `atCounter` skips the WhatsApp to them.
 */
export async function decideRefund(m: Mut, id: string, approve: boolean, by: Actor = m.actor, atCounter = false) {
  const r = await m.get("refunds", id, "Refund request", { lock: true });
  if (r.status !== "pending") throw badRequest(`This refund was already ${r.status}`);
  const settings = await m.settings();
  const allowed = by.can("refunds.approve") || (approve && !settings.refundNeedsApproval);
  if (!allowed) throw new HttpError(403, "Refunds need manager approval");

  await m.update("refunds", id, { status: approve ? "approved" : "rejected", decidedBy: by.id, decidedAt: new Date().toISOString() });
  if (approve) {
    const { max, customerId } = await refundable(m, r.target, r.targetId);
    if (r.amount > max) throw badRequest(`Only Rs. ${max.toLocaleString()} is left to refund`);
    let revenueType: TxType = "play";
    if (r.target === "ticket") {
      const t = await m.get("tickets", r.targetId, "Ticket", { lock: true });
      const zone = await m.find("zones", t.zoneId);
      revenueType = zone?.kind === "cowork" ? "cowork" : "play";
      // a partial refund (e.g. an overcharge) leaves the visit completed; only a full refund marks it refunded
      const paid = t.paid - r.amount;
      await m.update("tickets", t.id, { paid, status: paid <= 0 ? "refunded" : t.status });
    } else if (r.target === "sale") {
      revenueType = "pos";
      const x = await m.get("sales", r.targetId, "Sale", { lock: true });
      await m.update("sales", x.id, { refunded: (x.refunded ?? 0) + r.amount });
    } else {
      revenueType = "party";
      const b = await m.get("bookings", r.targetId, "Booking", { lock: true });
      // giving back an overcharge doesn't cancel the party; a cancellation refund does
      const cancels = r.category ? r.category === "cancelled" : r.full;
      await m.update("bookings", b.id, { paid: b.paid - r.amount, status: cancels ? "cancelled" : b.status });
    }
    await m.addTx({ type: "refund", revenueType, method: r.method, amount: -r.amount, ref: r.targetId, refLabel: r.label, customerId, discount: 0 });
    if (r.method === "wallet") {
      if (!customerId) throw badRequest("This sale has no customer — refund it another way");
      await creditWallet(m, customerId, r.amount);
    }
  }
  await m.log("Refunds", approve ? "Approved refund" : "Rejected refund", `${r.label} · Rs. ${r.amount.toLocaleString()}`);
  if (!atCounter) await alertRefundDecision(m.tx, settings, r, approve, by, (await m.find("users", r.requestedBy))?.name);
}

/** A manager approves at the counter by typing their credentials on the cashier's screen (throttled like sign-in). */
export async function managerActor(m: Mut, username: string, password: string, ip: string): Promise<Actor> {
  const u = await checkCredentials(username, password, ip, (name) =>
    m.tx.one<{ id: string; name: string; role_id: string; active: boolean; password_hash: string; permissions: string[] | null; locked: boolean | null }>(
      `SELECT u.id, u.name, u.role_id, u.active, u.password_hash, r.permissions, r.locked
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
        WHERE lower(u.username) = lower($1)`,
      [name.trim()],
    ),
  );
  const mgr = u && u.active && u.permissions ? actorOf({ id: u.id, name: u.name, roleId: u.role_id }, { permissions: u.permissions, locked: u.locked }) : undefined;
  if (!mgr || !mgr.can("refunds.approve")) throw new HttpError(403, "Manager credentials not valid for approvals");
  return mgr;
}
