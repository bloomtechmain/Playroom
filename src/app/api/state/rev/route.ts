import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { currentRev } from "@/server/mutation";

/** Cheap poll: open screens refetch the state when this number moves. */
export const GET = handler(async () => {
  await requireActor();
  return { rev: await currentRev() };
});
