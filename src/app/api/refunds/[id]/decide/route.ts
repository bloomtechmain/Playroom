import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { decideBody } from "@/server/schemas";
import { decideRefund } from "@/server/services/refunds";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor();
  const { id } = await params;
  const b = await readBody(req, decideBody);
  return mutate(actor, (m) => decideRefund(m, id, b.approve));
});
