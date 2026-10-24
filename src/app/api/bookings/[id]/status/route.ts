import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { bookingStatusBody } from "@/server/schemas";
import { setBookingStatus } from "@/server/services/bookings";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("bookings.edit");
  const { id } = await params;
  const b = await readBody(req, bookingStatusBody);
  return mutate(actor, (m) => setBookingStatus(m, id, b.status));
});
