import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { passwordBody } from "@/server/schemas";
import { changePassword } from "@/server/services/account";

export const POST = handler(async (req) => {
  const actor = await requireActor();
  const b = await readBody(req, passwordBody);
  return mutate(actor, (m) => changePassword(m, b.current, b.next));
});
