import { connection } from "next/server";
import { SYSTEM } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { publicBookingBody } from "@/server/schemas";
import { publicBooking } from "@/server/services/bookings";
import { loadBookingState } from "@/server/state";

/** Public online-booking page: availability, packages and prices (no customer data). */
export const GET = handler(async () => {
  await connection();
  return loadBookingState();
});

export const POST = handler(async (req) => {
  const input = await readBody(req, publicBookingBody);
  const { result } = await mutate(SYSTEM, (m) => publicBooking(m, input));
  return { booking: result };
});
