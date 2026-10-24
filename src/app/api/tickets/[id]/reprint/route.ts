import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { mutate } from "@/server/mutation";
import { reprintTicket } from "@/server/services/tickets";

export const POST = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("tickets.reprint");
  const { id } = await params;
  return mutate(actor, (m) => reprintTicket(m, id));
});
