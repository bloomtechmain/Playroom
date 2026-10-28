import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { bookingVisitBody } from "@/server/schemas";
import { partyVisit } from "@/server/services/bookings";

/** Party check-in (booking QR scanned) / check-out (adds overtime past the booked end). */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("bookings.edit", "tickets.sell");
  const { id } = await params;
  const b = await readBody(req, bookingVisitBody);
  return mutate(actor, (m) => partyVisit(m, id, b.action, b.waive));
});
