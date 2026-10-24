import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { mutate } from "@/server/mutation";
import { manualBackup } from "@/server/services/admin";

/** Take a snapshot now; the response carries it so the browser can download the file. */
export const POST = handler(async () => {
  const actor = await requireActor("settings.edit");
  return mutate(actor, (m) => manualBackup(m));
});
