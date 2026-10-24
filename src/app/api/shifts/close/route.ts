import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { closeShiftBody } from "@/server/schemas";
import { closeShift } from "@/server/services/money";

export const POST = handler(async (req) => {
  const actor = await requireActor("shifts.own");
  const b = await readBody(req, closeShiftBody);
  return mutate(actor, (m) => closeShift(m, b.counted, b.notes));
});
