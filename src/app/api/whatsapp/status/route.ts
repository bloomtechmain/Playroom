import { requireActor } from "@/server/auth";
import { db } from "@/server/db";
import { handler } from "@/server/http";
import { wa } from "@/server/whatsapp/connection";
import type { WaStatus } from "@/lib/whatsapp";

/** Connection state (+ the QR while linking) and today's queue numbers. */
export const GET = handler(async (): Promise<WaStatus> => {
  await requireActor("whatsapp.send", "whatsapp.connect");
  const q = (await db.one<WaStatus["queue"]>(
    `SELECT count(*) FILTER (WHERE status IN ('queued', 'sending'))::int AS queued,
            count(*) FILTER (WHERE status = 'sent' AND sent_at >= date_trunc('day', now()))::int AS "sentToday",
            count(*) FILTER (WHERE status = 'failed' AND created_at >= date_trunc('day', now()))::int AS "failedToday",
            count(*) FILTER (WHERE status = 'sent' AND kind IN ('birthday', 'promotion') AND sent_at >= date_trunc('day', now()))::int AS "marketingToday"
       FROM whatsapp_messages`,
  ))!;
  return { status: wa.status, qr: wa.qr, me: wa.me, error: wa.error, queue: q };
});
