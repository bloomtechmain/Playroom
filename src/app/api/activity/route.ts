import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { logBody } from "@/server/schemas";

/** Audit entries written from the browser (e.g. restoring a backup file name). */
export const POST = handler(async (req) => {
  const actor = await requireActor();
  const b = await readBody(req, logBody);
  return mutate(actor, (m) => m.log(b.module, b.action, b.detail, b.before, b.after));
});
