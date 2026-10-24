import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { openShiftBody } from "@/server/schemas";
import { openShift } from "@/server/services/money";

export const POST = handler(async (req) => {
  const actor = await requireActor("shifts.own");
  const b = await readBody(req, openShiftBody);
  return mutate(actor, (m) => openShift(m, b.float));
});
