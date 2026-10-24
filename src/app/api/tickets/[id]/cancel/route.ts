import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { cancelBody } from "@/server/schemas";
import { cancelTicket } from "@/server/services/tickets";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("tickets.cancel");
  const { id } = await params;
  const b = await readBody(req, cancelBody);
  return mutate(actor, (m) => cancelTicket(m, id, b.reason, b.refundMethod));
});
