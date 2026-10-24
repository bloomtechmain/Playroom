import { handler, readBody } from "@/server/http";
import { loginBody } from "@/server/schemas";
import { login } from "@/server/services/account";

export const POST = handler(async (req) => {
  const { username, password } = await readBody(req, loginBody);
  await login(username, password);
  return { ok: true };
});
