import { SYSTEM } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { clockBody } from "@/server/schemas";
import { clockByToken } from "@/server/services/hr";

export const POST = handler(async (req) => {
  const { token } = await readBody(req, clockBody);
  const { result } = await mutate(SYSTEM, (m) => clockByToken(m, token));
  return result;
});
