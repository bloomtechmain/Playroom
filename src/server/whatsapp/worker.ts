import { format } from "date-fns";
import QRCode from "qrcode";
import { whatsappSettings } from "@/lib/whatsapp";
import { sharedPool, wrap } from "../db/pool";
import { readSettings } from "../snapshot";
import { resumeIfLinked, sendWhatsApp, wa } from "./connection";
import { queueBirthdays, todaysBirthdayChildIds } from "./messages";

/**
 * Background sender. Works through whatsapp_messages one at a time while WhatsApp is connected:
 * receipts and check-in messages first, then birthday wishes and promotions with a random pause
 * between them and a daily cap — bursts of identical messages are what get numbers banned.
 */
interface WorkerState {
  started: boolean;
  busy: boolean;
  nextAt: number;
  birthdaysDoneOn?: string;
}
const g = globalThis as unknown as { __playroomWaWorker?: WorkerState };
const state: WorkerState = (g.__playroomWaWorker ??= { started: false, busy: false, nextAt: 0 });

const sql = () => wrap(sharedPool());
const MARKETING = ["birthday", "promotion"];

async function tick() {
  if (state.busy || wa.status !== "connected" || Date.now() < state.nextAt) return;
  state.busy = true;
  try {
    const s = sql();
    const settings = await readSettings(s);
    const w = whatsappSettings(settings);
    // a welcome or receipt that couldn't go out within 2 hours is no use any more
    await s.query(
      "UPDATE whatsapp_messages SET status = 'cancelled', error = 'Expired — WhatsApp was not connected in time' WHERE status = 'queued' AND kind IN ('checkin', 'receipt', 'staff') AND created_at < now() - interval '2 hours'",
    );
    const { n } = (await s.one<{ n: number }>("SELECT count(*)::int AS n FROM whatsapp_messages WHERE status = 'sent' AND kind = ANY($1::text[]) AND sent_at >= date_trunc('day', now())", [MARKETING]))!;
    const msg = await s.one<{ id: string; kind: string; to_phone: string; body: string; media: { type: string; data: string } | null }>(
      `SELECT id, kind, to_phone, body, media FROM whatsapp_messages
        WHERE status = 'queued' AND (kind <> ALL($1::text[]) OR $2)
        ORDER BY priority, seq LIMIT 1`,
      [MARKETING, n < w.dailyLimit],
    );
    if (!msg) return;
    await s.query("UPDATE whatsapp_messages SET status = 'sending', attempts = attempts + 1 WHERE id = $1", [msg.id]);
    try {
      if (msg.media?.type === "qr") {
        const image = await QRCode.toBuffer(msg.media.data, { width: 480, margin: 2 });
        await sendWhatsApp(msg.to_phone, { image, caption: msg.body });
      } else await sendWhatsApp(msg.to_phone, { text: msg.body });
      await s.query("UPDATE whatsapp_messages SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1", [msg.id]);
    } catch (e) {
      await s.query("UPDATE whatsapp_messages SET status = 'failed', error = $2 WHERE id = $1", [msg.id, e instanceof Error ? e.message : "Send failed"]);
    }
    const marketing = MARKETING.includes(msg.kind);
    const min = Math.max(2, w.minDelay);
    const max = Math.max(min, w.maxDelay);
    state.nextAt = Date.now() + (marketing ? (min + Math.random() * (max - min)) * 1000 : 1500);
  } catch (e) {
    console.error("WhatsApp worker:", e);
    state.nextAt = Date.now() + 10_000;
  } finally {
    state.busy = false;
  }
}

/** Once a day, at the configured time, queue wishes for today's birthdays. */
async function birthdayTick() {
  const today = format(new Date(), "yyyy-MM-dd");
  if (state.birthdaysDoneOn === today) return;
  try {
    const s = sql();
    const settings = await readSettings(s);
    const w = whatsappSettings(settings);
    if (!w.birthdayAuto || format(new Date(), "HH:mm") < w.birthdayTime) return;
    state.birthdaysDoneOn = today;
    const ids = await todaysBirthdayChildIds(s);
    if (ids.length) await queueBirthdays(s, settings, ids, "system");
  } catch (e) {
    console.error("WhatsApp birthdays:", e);
  }
}

/** Start once per server process (called from instrumentation at startup). */
export function startWhatsApp() {
  if (state.started) return;
  state.started = true;
  // anything that was mid-send when the server stopped goes back in the queue
  void sql()
    .query("UPDATE whatsapp_messages SET status = 'queued' WHERE status = 'sending'")
    .catch(() => undefined);
  void resumeIfLinked();
  setInterval(() => void tick(), 3000);
  setInterval(() => void birthdayTick(), 60_000);
}
