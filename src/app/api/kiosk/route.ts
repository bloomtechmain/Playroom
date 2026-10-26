import { connection } from "next/server";
import { handler } from "@/server/http";
import { clientIp, limit } from "@/server/rateLimit";
import { loadKioskState } from "@/server/state";

export const GET = handler(async (req) => {
  await connection();
  limit(`kiosk-view:${clientIp(req)}`, 120, 60_000);
  return loadKioskState();
});
