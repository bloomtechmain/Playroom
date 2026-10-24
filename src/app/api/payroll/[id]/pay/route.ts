import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { mutate } from "@/server/mutation";
import { payPayroll } from "@/server/services/records";

export const POST = handler(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor("payroll.run");
  const { id } = await params;
  return mutate(actor, (m) => payPayroll(m, id));
});
