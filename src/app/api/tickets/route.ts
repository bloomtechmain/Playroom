import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { checkInBody } from "@/server/schemas";
import { checkIn } from "@/server/services/tickets";

/** Check a family in to the play area, co-work, or both. Returns the ticket(s) — one per area. */
export const POST = handler(async (req) => {
  const actor = await requireActor("tickets.sell");
  const b = await readBody(req, checkInBody);
  return mutate(actor, (m) => checkIn(m, b));
});
