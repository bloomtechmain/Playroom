import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { topUpBody } from "@/server/schemas";
import { topUpWallet } from "@/server/services/money";

export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("wallet.adjust");
  const { id } = await params;
  const b = await readBody(req, topUpBody);
  return mutate(actor, (m) => topUpWallet(m, id, b.amount, b.method));
});
