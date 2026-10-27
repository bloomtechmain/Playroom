import { cookies } from "next/headers";
import { z } from "zod";
import { requireActor } from "@/server/auth";
import { handler, readBody } from "@/server/http";
import { PRACTICE_COOKIE } from "@/server/practice";
import { openPractice, resetPractice } from "@/server/services/practice";

const body = z.object({ action: z.enum(["open", "leave", "reset"]) });

/**
 * open: switch this browser to the practice copy (made from the real data the first time) · leave: back to
 * the real data · reset: replace the practice copy with a fresh copy of the real data (managers).
 * The cookie only chooses which database this browser works on; it lasts until the browser is closed.
 */
export const POST = handler(async (req) => {
  const { action } = await readBody(req, body);
  const jar = await cookies();
  if (action === "leave") {
    jar.delete(PRACTICE_COOKIE);
    return { ok: true };
  }
  if (action === "reset") {
    await resetPractice(await requireActor("settings.edit"));
    return { ok: true };
  }
  await openPractice(await requireActor());
  jar.set(PRACTICE_COOKIE, "1", { sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return { ok: true };
});
