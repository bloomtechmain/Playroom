import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireActor } from "@/server/auth";
import { db } from "@/server/db";
import { handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import type { UpcomingBirthday } from "@/lib/whatsapp";
import { nextBirthday, queueBirthdays } from "@/server/whatsapp/messages";


/** Children whose birthday falls in the next ?days= days (default 30), soonest first. */
export const GET = handler(async (req: NextRequest): Promise<UpcomingBirthday[]> => {
  await requireActor("whatsapp.send");
  const days = Math.min(366, Math.max(0, Number(req.nextUrl.searchParams.get("days")) || 30));
  const rows = await db.query<{ id: string; name: string; dob: string; guardian_id: string; guardian: string; phone: string; opt_out: boolean; wished: string | null }>(
    `SELECT k.id, k.name, k.dob, k.guardian_id, c.name AS guardian, c.phone, c.whatsapp_opt_out AS opt_out,
            (SELECT m.status FROM whatsapp_messages m WHERE m.kind = 'birthday' AND m.child_id = k.id AND m.status IN ('queued', 'sending', 'sent')
               AND date_part('year', m.created_at) = date_part('year', now()) ORDER BY m.seq DESC LIMIT 1) AS wished
       FROM children k JOIN customers c ON c.id = k.guardian_id`,
  );
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  return rows
    .map((r) => {
      const nb = nextBirthday(r.dob, today);
      const inDays = Math.round((nb.date.getTime() - today.getTime()) / 86_400_000);
      const date = `${nb.date.getFullYear()}-${String(nb.date.getMonth() + 1).padStart(2, "0")}-${String(nb.date.getDate()).padStart(2, "0")}`;
      return { childId: r.id, child: r.name, dob: r.dob, date, age: nb.age, inDays, customerId: r.guardian_id, guardian: r.guardian, phone: r.phone, optOut: r.opt_out, wished: r.wished ?? undefined };
    })
    .filter((b) => b.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays || a.child.localeCompare(b.child));
});

/** Queue birthday wishes for these children. */
export const POST = handler(async (req) => {
  const actor = await requireActor("whatsapp.send");
  const { childIds } = await readBody(req, z.object({ childIds: z.array(z.string().max(100)).min(1).max(2000) }));
  return mutate(actor, async (m) => {
    const r = await queueBirthdays(m.tx, await m.settings(), childIds, actor.id);
    await m.log("WhatsApp", "Birthday wishes", `${r.queued} queued${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
    return r;
  });
});
