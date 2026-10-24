import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { saleBody } from "@/server/schemas";
import { recordSale } from "@/server/services/sales";

export const POST = handler(async (req) => {
  const actor = await requireActor("pos.sell");
  const b = await readBody(req, saleBody);
  return mutate(actor, (m) => recordSale(m, b.items, b.discount, b.method, b.tendered, b.customerId));
});
