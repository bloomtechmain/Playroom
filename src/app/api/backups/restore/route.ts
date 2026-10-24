import type { DB as Snapshot } from "@/lib/seed";
import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { restoreBody } from "@/server/schemas";
import { restoreBackup } from "@/server/services/admin";

export const POST = handler(async (req) => {
  const actor = await requireActor("settings.edit");
  const { snapshot, fileName } = await readBody(req, restoreBody);
  return mutate(actor, (m) => restoreBackup(m, snapshot as unknown as Snapshot, fileName));
});
