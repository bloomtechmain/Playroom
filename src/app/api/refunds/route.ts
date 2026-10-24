import { requireActor } from "@/server/auth";
import { badRequest, handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { refundBody } from "@/server/schemas";
import { decideRefund, managerActor, requestRefund } from "@/server/services/refunds";

/** Request a refund; optionally approve it straight away (own permission, or a manager signs off at the counter). */
export const POST = handler(async (req) => {
  const actor = await requireActor("refunds.request", "refunds.approve");
  const b = await readBody(req, refundBody);
  return mutate(actor, async (m) => {
    if (b.approve === "manager") {
      if (!b.manager) throw badRequest("Manager credentials are required");
      const mgr = await managerActor(m, b.manager.username, b.manager.password);
      const r = await requestRefund(m, { ...b.refund, reason: `${b.refund.reason} (approved at counter by ${mgr.name})` });
      await decideRefund(m, r.id, true, mgr);
      return { ...r, approvedBy: mgr.name };
    }
    const r = await requestRefund(m, b.refund);
    if (b.approve === "now") await decideRefund(m, r.id, true);
    return r;
  });
});
