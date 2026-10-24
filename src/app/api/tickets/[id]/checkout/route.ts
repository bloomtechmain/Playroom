import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { checkoutBody } from "@/server/schemas";
import { checkoutVisit } from "@/server/services/tickets";

/** Check out the whole visit this ticket belongs to; the price comes from the time actually spent. */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("tickets.checkout");
  const { id } = await params;
  const b = await readBody(req, checkoutBody);
  return mutate(actor, (m) => checkoutVisit(m, id, b));
});
