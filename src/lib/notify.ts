"use client";

/**
 * Staff notifications: things that just happened and someone should act on (an online booking request,
 * a refund waiting for approval, a decision on your refund request), worked out from the data every
 * screen already has — so the bell list is complete after a reload or on another PC. New ones, and new
 * live alerts (zone full, low stock…), also pop up as a desktop notification with a chime, even when the
 * app is in a background tab.
 */

import { useEffect, useMemo, useState } from "react";
import { useNow } from "./hooks";
import { useStore, useCan, useMe } from "./store";
import type { Alert } from "./hooks";
import { fmtDate, money } from "./utils";

export interface Note {
  id: string;
  at: string;
  tone: Alert["tone"] | "mint";
  title: string;
  text: string;
  href: string;
}

const DAYS = 7;
const firstName = (n?: string) => n?.split(" ")[0] ?? "";

/** The last week's notifications for the signed-in user, newest first. */
export function useNotes(): Note[] {
  const me = useMe();
  const can = useCan();
  const bookings = useStore((s) => s.bookings);
  const refunds = useStore((s) => s.refunds);
  const customers = useStore((s) => s.customers);
  const users = useStore((s) => s.users);
  const seesBookings = can("bookings.view") || can("bookings.edit");
  const approves = can("refunds.approve");
  const now = useNow(60_000);
  return useMemo(() => {
    if (!me) return [];
    const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
    const out: Note[] = [];
    if (seesBookings)
      for (const b of bookings) {
        if (b.source !== "online" || b.createdAt < since) continue;
        const c = customers.find((x) => x.id === b.customerId);
        out.push({
          id: `booking-${b.id}`,
          at: b.createdAt,
          tone: "lilac",
          title: `New online ${b.kind === "party" ? "party " : ""}booking request`,
          text: `${b.ref} · ${c?.name ?? "Customer"} · ${fmtDate(b.date, "EEE d MMM")} ${b.start}${b.status === "pending" ? " — waiting for confirmation" : ""}`,
          href: "/bookings",
        });
      }
    for (const r of refunds) {
      const by = users.find((u) => u.id === r.requestedBy)?.name;
      if (approves && r.requestedBy !== me.id && r.at >= since)
        out.push({
          id: `refund-req-${r.id}`,
          at: r.at,
          tone: "sky",
          title: r.status === "pending" ? "Refund waiting for your approval" : `Refund request (${r.status})`,
          text: `${r.label} · ${money(r.amount)} · requested by ${firstName(by)}${r.reason ? ` — ${r.reason}` : ""}`,
          href: "/refunds",
        });
      if (r.requestedBy === me.id && r.status !== "pending" && r.decidedAt && r.decidedAt >= since && r.decidedBy !== me.id)
        out.push({
          id: `refund-done-${r.id}`,
          at: r.decidedAt,
          tone: r.status === "approved" ? "mint" : "rose",
          title: r.status === "approved" ? "Your refund was approved" : "Your refund was rejected",
          text: `${r.label} · ${money(r.amount)} · by ${firstName(users.find((u) => u.id === r.decidedBy)?.name)}`,
          href: "/refunds",
        });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [me, seesBookings, approves, bookings, refunds, customers, users, now]);
}

// ---------------------------------------------------------------- read / unread (per user, this browser)

const readKey = (userId: string) => `playroom-notes-read:${userId}`;
const getStored = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const setStored = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // storage blocked: the unread count just resets
  }
};

/** When the user last opened the bell; notifications after it count as unread. */
export function useReadMark(userId?: string) {
  const [readAt, setReadAt] = useState(() => (userId ? (getStored(readKey(userId)) ?? "") : ""));
  const markRead = () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setStored(readKey(userId), now);
    setReadAt(now);
  };
  return [readAt, markRead] as const;
}

// ---------------------------------------------------------------- desktop popups + chime

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;

let audio: AudioContext | undefined;

/** A short two-note chime (no sound file needed). Browsers only allow it after the user has clicked the page once. */
export function chime() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const t0 = audio.currentTime;
    for (const [i, f] of [880, 1318.5].entries()) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.5);
    }
  } catch {
    // no audio on this device
  }
}

/** Ask for desktop notifications and unlock the chime — needs a click, so it's called from one. */
export async function enableNotifications() {
  audio ??= new AudioContext();
  void audio.resume();
  if (!notifySupported() || Notification.permission !== "default") return notifySupported() ? Notification.permission : "denied";
  return Notification.requestPermission();
}

/**
 * Popped ids, shared by every tab of this browser so a notification pops once, not once per open tab.
 * Notifications are claimed once. Live alerts are "touched" every time a screen sees them, and pop again
 * only after being gone for 30 minutes (a zone that fills up again later in the day). Kept two days.
 */
const POPPED = "playroom-notified";
const ALERT_GAP = 30 * 60_000;
function mark(id: string, alert: boolean) {
  let seen: Record<string, number> = {};
  try {
    seen = JSON.parse(getStored(POPPED) ?? "{}");
  } catch {
    // corrupted: start again
  }
  const now = Date.now();
  const prev = seen[id];
  if (prev && !alert) return false;
  seen[id] = now;
  for (const [k, t] of Object.entries(seen)) if (now - t > 2 * 86_400_000) delete seen[k];
  setStored(POPPED, JSON.stringify(seen));
  return !prev || now - prev > ALERT_GAP;
}

/** Older than this when the screen first sees it = happened while nobody was here: listed, not popped. */
const FRESH_MS = 15 * 60_000;

function pop(n: { id: string; title: string; text: string; href: string }, go: (href: string) => void) {
  chime();
  if (!notifySupported() || Notification.permission !== "granted") return;
  try {
    const w = new Notification(n.title, { body: n.text, tag: n.id, icon: "/logo.png" });
    w.onclick = () => {
      window.focus();
      go(n.href);
      w.close();
    };
  } catch {
    // some browsers only allow notifications from a service worker
  }
}

/** Runs in the app frame: pops each new notification and each newly raised live alert. */
export function useDesktopNotifier(notes: Note[], alerts: Alert[], go: (href: string) => void) {
  const [ready, setReady] = useState(false);
  // the first data the screen gets is the starting point, not news
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    for (const n of notes) if (now - new Date(n.at).getTime() < FRESH_MS && mark(n.id, false)) pop(n, go);
    // the refund-count alert is covered by the refund notifications above
    for (const a of alerts) if (a.id !== "refunds" && mark(`alert-${a.id}`, true)) pop(a, go);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is a fresh closure each render
  }, [ready, notes, alerts]);
}
