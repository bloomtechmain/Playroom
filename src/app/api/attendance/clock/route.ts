import { requireActor } from "@/server/auth";
import { handler, HttpError, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { clientIp, limit, note, recent } from "@/server/rateLimit";
import { clockBody } from "@/server/schemas";
import { clockByToken } from "@/server/services/hr";

/** Badge scan in "Staff attendance" on a signed-in screen (front desk QR reader). */
export const POST = handler(async (req) => {
  const actor = await requireActor();
  // unknown badges are counted per connection so tokens can't be guessed
  const ip = clientIp(req);
  if (recent(`badge-miss:${ip}`, 15 * 60_000) >= 20) throw new HttpError(429, "Too many unrecognised badges — wait a few minutes");
  limit(`clock:${ip}`, 60, 60_000);
  const { token, direction } = await readBody(req, clockBody);
  const { result } = await mutate(actor, (m) => clockByToken(m, token, direction));
  if (!result.ok && !result.name) note(`badge-miss:${ip}`);
  return result;
});
