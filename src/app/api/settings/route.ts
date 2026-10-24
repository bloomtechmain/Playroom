import type { Settings } from "@/lib/types";
import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { settingsBody } from "@/server/schemas";
import { setSettings } from "@/server/services/admin";

/** Permission is checked per setting key (holidays → pricing, EPF/ETF → payroll, rest → settings). */
export const PATCH = handler(async (req) => {
  const actor = await requireActor();
  const { patch, detail } = await readBody(req, settingsBody);
  return mutate(actor, (m) => setSettings(m, patch as Partial<Settings>, detail));
});
