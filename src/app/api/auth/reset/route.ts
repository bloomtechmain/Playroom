import { handler, readBody } from "@/server/http";
import { resetBody } from "@/server/schemas";
import { resetPassword } from "@/server/services/account";

export const POST = handler(async (req) => {
  const { who, code, password } = await readBody(req, resetBody);
  await resetPassword(who, code, password);
  return { ok: true };
});
