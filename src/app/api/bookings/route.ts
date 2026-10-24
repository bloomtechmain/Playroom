import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { bookingBody } from "@/server/schemas";
import { createBooking } from "@/server/services/bookings";

export const POST = handler(async (req) => {
  const actor = await requireActor("bookings.edit");
  const b = await readBody(req, bookingBody);
  return mutate(actor, (m) => createBooking(m, { ...b.booking, paid: 0 }, b.payNow, b.method));
});
