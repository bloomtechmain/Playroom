import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireActor } from "@/server/auth";
import { db } from "@/server/db";
import { badRequest, handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { normalizePhone, whatsappSettings, type WaMessage } from "@/lib/whatsapp";
import { enqueue } from "@/server/whatsapp/messages";

/** The message log, newest first. ?status=queued|sent|failed|cancelled  ?kind=…  ?limit= */
export const GET = handler(async (req: NextRequest): Promise<WaMessage[]> => {
  await requireActor("whatsapp.send");
  const q = req.nextUrl.searchParams;
  const params: unknown[] = [Math.min(500, Number(q.get("limit")) || 200)];
  let where = "true";
  if (q.get("status")) {
    params.push(q.get("status"));
    where += ` AND m.status = $${params.length}`;
  }
  if (q.get("kind")) {
    params.push(q.get("kind"));
    where += ` AND m.kind = $${params.length}`;
  }
  return db.query<WaMessage>(
    `SELECT m.id, m.created_at AS "createdAt", m.kind, m.customer_id AS "customerId", c.name AS "customerName", m.child_id AS "childId",
            m.to_phone AS "toPhone", m.body, m.campaign, m.status, m.error, m.attempts, m.sent_at AS "sentAt"
       FROM whatsapp_messages m LEFT JOIN customers c ON c.id = m.customer_id
      WHERE ${where} ORDER BY m.seq DESC LIMIT $1`,
    params,
  );
});

const actionBody = z.object({
  action: z.enum(["retry", "cancel", "send"]),
  ids: z.array(z.string().max(100)).max(5000).optional(),
  /** send: one message to one number (e.g. a test) */
  phone: z.string().max(30).optional(),
  body: z.string().max(4000).optional(),
});

/** retry failed · cancel queued · send a single message */
export const POST = handler(async (req) => {
  const actor = await requireActor("whatsapp.send");
  const b = await readBody(req, actionBody);
  return mutate(actor, async (m) => {
    if (b.action === "send") {
      const settings = await m.settings();
      const phone = normalizePhone(b.phone, whatsappSettings(settings).countryCode);
      if (!phone) throw badRequest("Enter a mobile number");
      if (!b.body?.trim()) throw badRequest("Type a message");
      await enqueue(m.tx, { kind: "manual", phone, body: b.body.trim(), priority: 2, createdBy: actor.id });
      await m.log("WhatsApp", "Message", `To ${phone}`);
      return { count: 1 };
    }
    const ids = b.ids ?? [];
    const rows =
      b.action === "retry"
        ? await m.tx.query("UPDATE whatsapp_messages SET status = 'queued', error = NULL WHERE status = 'failed' AND ($1::text[] IS NULL OR id = ANY($1::text[])) RETURNING id", [ids.length ? ids : null])
        : await m.tx.query("UPDATE whatsapp_messages SET status = 'cancelled', error = 'Cancelled by staff' WHERE status = 'queued' AND ($1::text[] IS NULL OR id = ANY($1::text[])) RETURNING id", [ids.length ? ids : null]);
    await m.log("WhatsApp", b.action === "retry" ? "Retry" : "Cancel", `${rows.length} message(s)`);
    return { count: rows.length };
  });
});
