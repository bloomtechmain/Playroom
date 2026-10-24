import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { payBookingBody } from "@/server/schemas";
import { payBooking } from "@/server/services/bookings";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("bookings.edit", "tickets.sell");
  const { id } = await params;
  const b = await readBody(req, payBookingBody);
  return mutate(actor, (m) => payBooking(m, id, b.amount, b.method));
});
