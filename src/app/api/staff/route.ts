import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { staffBody } from "@/server/schemas";
import { saveStaff } from "@/server/services/hr";
import type { Employee } from "@/lib/types";

/** Add or edit an employee, optionally creating their app login in the same step. */
export const POST = handler(async (req) => {
  const actor = await requireActor("hr.edit");
  const b = await readBody(req, staffBody);
  return mutate(actor, (m) => saveStaff(m, b.employee as unknown as Employee, b.login));
});
