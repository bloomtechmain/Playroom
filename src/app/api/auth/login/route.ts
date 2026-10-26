import { handler, readBody } from "@/server/http";
import { clientIp } from "@/server/rateLimit";
import { loginBody } from "@/server/schemas";
import { login } from "@/server/services/account";

export const POST = handler(async (req) => {
  const { username, password } = await readBody(req, loginBody);
  await login(username, password, clientIp(req));
  return { ok: true };
});
