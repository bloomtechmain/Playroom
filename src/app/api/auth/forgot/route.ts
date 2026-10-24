import { handler, readBody } from "@/server/http";
import { forgotBody } from "@/server/schemas";
import { forgotPassword } from "@/server/services/account";

export const POST = handler(async (req) => {
  const { who } = await readBody(req, forgotBody);
  return forgotPassword(who);
});
