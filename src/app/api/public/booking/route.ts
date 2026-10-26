import { connection } from "next/server";
import { SYSTEM } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { clientIp, limit } from "@/server/rateLimit";
import { publicBookingBody } from "@/server/schemas";
import { publicBooking } from "@/server/services/bookings";
import { loadBookingState } from "@/server/state";

/** Public online-booking page: availability, packages and prices (no customer data). */
export const GET = handler(async (req) => {
  await connection();
  limit(`book-view:${clientIp(req)}`, 120, 60_000);
  return loadBookingState();
});

export const POST = handler(async (req) => {
  // each request holds a slot until staff take the deposit: stop one visitor from filling the calendar
  limit(`book:${clientIp(req)}`, 10, 3_600_000, "Too many booking requests from this connection — please call us to book");
  const input = await readBody(req, publicBookingBody);
  const { result } = await mutate(SYSTEM, (m) => publicBooking(m, input));
  return { booking: result };
});
