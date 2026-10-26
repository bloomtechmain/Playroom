import { SYSTEM } from "@/server/auth";
import { handler, HttpError, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { clientIp, limit, note, recent } from "@/server/rateLimit";
import { clockBody } from "@/server/schemas";
import { clockByToken } from "@/server/services/hr";

export const POST = handler(async (req) => {
  // the kiosk is public: unknown badges are counted per connection so tokens can't be guessed
  const ip = clientIp(req);
  if (recent(`badge-miss:${ip}`, 15 * 60_000) >= 20) throw new HttpError(429, "Too many unrecognised badges — wait a few minutes");
  limit(`clock:${ip}`, 60, 60_000);
  const { token } = await readBody(req, clockBody);
  const { result } = await mutate(SYSTEM, (m) => clockByToken(m, token));
  if (!result.ok && !result.name) note(`badge-miss:${ip}`);
  return result;
});
