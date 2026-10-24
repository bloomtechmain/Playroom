import { requireActor, requireDemo } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { switchBody } from "@/server/schemas";
import { switchUser } from "@/server/services/account";

/** Demo only: the "switch role" menu in the top bar. */
export const POST = handler(async (req) => {
  requireDemo();
  await requireActor();
  const { userId } = await readBody(req, switchBody);
  await switchUser(userId);
  return { ok: true };
});
