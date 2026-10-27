import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, type WASocket } from "baileys";
import pino from "pino";
import { uid } from "@/lib/utils";
import { sharedPool, transaction, wrap } from "../db/pool";
import { commitRev } from "../rev";
import { clearAuth, isLinked, dbAuthState } from "./auth";

/**
 * The app's own WhatsApp "linked device": one live connection per server process, made by scanning
 * a QR code from WhatsApp → Linked devices on the business phone. State lives on globalThis so the
 * route handlers, the background worker and dev hot reloads all see the same connection.
 */
interface Runtime {
  sock?: WASocket;
  status: "disconnected" | "connecting" | "qr" | "connected";
  qr?: string;
  me?: { id: string; name?: string };
  error?: string;
  /** someone pressed Connect (or the server resumed a linked account) — keep reconnecting */
  wanted: boolean;
  connecting: boolean;
  retries: number;
  qrShown: number;
}

const g = globalThis as unknown as { __playroomWa?: Runtime };
export const wa: Runtime = (g.__playroomWa ??= { status: "disconnected", wanted: false, connecting: false, retries: 0, qrShown: 0 });

const sql = () => wrap(sharedPool());

/** Digits of a WhatsApp address ("94771234567@s.whatsapp.net" → "94771234567"). */
const phoneOf = (jid?: string | null) => (jid && jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0].split(":")[0] : null);

export async function connect() {
  if (wa.sock || wa.connecting) return;
  wa.wanted = true;
  wa.connecting = true;
  wa.status = "connecting";
  wa.error = undefined;
  try {
    const { state, saveCreds } = await dbAuthState(sql());
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.windows("The Playroom"),
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    wa.sock = sock;
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        wa.qr = u.qr;
        wa.status = "qr";
        wa.qrShown++;
      }
      if (u.connection === "open") {
        wa.status = "connected";
        wa.qr = undefined;
        wa.qrShown = 0;
        wa.retries = 0;
        wa.error = undefined;
        wa.me = sock.user ? { id: phoneOf(sock.user.id.replace(/:\d+@/, "@")) ?? sock.user.id, name: sock.user.name ?? sock.user.verifiedName } : undefined;
      }
      if (u.connection === "close") {
        wa.sock = undefined;
        const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          // unlinked from the phone: forget the login
          await clearAuth(sql()).catch(() => undefined);
          Object.assign(wa, { status: "disconnected", wanted: false, me: undefined, qr: undefined, error: "This device was logged out from the phone. Scan the QR again to reconnect." });
          return;
        }
        if (wa.status === "qr" && wa.qrShown >= 5 && !(await isLinked(sql()).catch(() => false))) {
          // nobody scanned for a few minutes — stop asking
          Object.assign(wa, { status: "disconnected", wanted: false, qr: undefined, qrShown: 0, error: "The QR code expired. Press Connect to get a new one." });
          return;
        }
        if (!wa.wanted) {
          wa.status = "disconnected";
          return;
        }
        // network blips, restarts after pairing (515), server-side disconnects: try again with back-off
        wa.status = "connecting";
        const wait = Math.min(30_000, 1000 * 2 ** wa.retries++);
        setTimeout(() => void connect(), wait);
      }
    });

    // customers who reply STOP stop receiving promotions and birthday wishes
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (m.key.fromMe) continue;
        const text = (m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "").trim();
        if (!/^(stop|unsubscribe)$/i.test(text)) continue;
        const key = m.key as { remoteJid?: string | null; remoteJidAlt?: string | null; senderPn?: string | null };
        const phone = phoneOf(key.remoteJidAlt) ?? phoneOf(key.senderPn) ?? phoneOf(key.remoteJid);
        if (!phone) continue;
        const s = sql();
        // stored numbers are local (07X…) or international — compare on the last 9 digits
        const hit = await s.query<{ id: string; name: string }>(
          "UPDATE customers SET whatsapp_opt_out = true WHERE right(regexp_replace(phone, '\\D', '', 'g'), 9) = right($1, 9) AND NOT whatsapp_opt_out RETURNING id, name",
          [phone],
        );
        const logged: string[] = [];
        for (const c of hit) {
          const id = uid("ac");
          await s.query("INSERT INTO activity (id, at, user_id, module, action, detail) VALUES ($1, now(), 'system', 'WhatsApp', 'Opted out', $2)", [id, `${c.name} replied STOP — no more promotions`]);
          logged.push(id);
        }
        if (hit.length) {
          await transaction(sharedPool(), (tx) => commitRev(tx, { upserts: { customers: hit.map((c) => c.id), activity: logged } }));
          await sock.sendMessage(m.key.remoteJid!, { text: "You won't receive offers from us any more. Thank you!" }).catch(() => undefined);
        }
      }
    });
  } catch (e) {
    wa.sock = undefined;
    wa.status = "disconnected";
    wa.error = e instanceof Error ? e.message : "Couldn't start WhatsApp";
  } finally {
    wa.connecting = false;
  }
}

/** Log out the linked device and forget it. */
export async function disconnect() {
  wa.wanted = false;
  const sock = wa.sock;
  wa.sock = undefined;
  if (sock) {
    await sock.logout().catch(() => undefined);
    sock.end(undefined);
  }
  await clearAuth(sql());
  Object.assign(wa, { status: "disconnected", me: undefined, qr: undefined, error: undefined, qrShown: 0 });
}

/** After a server restart: reconnect if a phone is already linked. */
export async function resumeIfLinked() {
  if (wa.sock || wa.connecting || wa.wanted) return;
  if (await isLinked(sql()).catch(() => false)) await connect();
}

/**
 * Send one message. Throws with a readable reason (not connected, number not on WhatsApp…).
 * `phone` "self" = the linked number itself (staff alerts land in its "Message yourself" chat).
 */
export async function sendWhatsApp(phone: string, content: { text: string } | { image: Buffer; caption: string }) {
  const sock = wa.sock;
  if (!sock || wa.status !== "connected") throw new Error("WhatsApp is not connected");
  if (phone === "self") {
    if (!wa.me?.id || !/^\d+$/.test(wa.me.id)) throw new Error("The linked WhatsApp number isn't known yet");
    await sock.sendMessage(`${wa.me.id}@s.whatsapp.net`, content);
    return;
  }
  const [found] = (await sock.onWhatsApp(phone)) ?? [];
  if (!found?.exists) throw new Error("This number isn't on WhatsApp");
  await sock.sendMessage(found.jid, content);
}
