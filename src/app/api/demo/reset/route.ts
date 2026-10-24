import { requireActor, requireDemo } from "@/server/auth";
import { handler } from "@/server/http";
import { mutate } from "@/server/mutation";
import { resetDemo } from "@/server/services/admin";

export const POST = handler(async () => {
  requireDemo();
  const actor = await requireActor("settings.edit");
  return mutate(actor, (m) => resetDemo(m));
});
