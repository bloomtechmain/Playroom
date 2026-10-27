"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "./store";
import { lockoutAt } from "./pricing";
import { today, timeToMin, fmtTime } from "./utils";

const noop = () => () => {};
/** true only on the client after hydration — avoids SSR/localStorage mismatches */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * Keeps the cursor in a scan box so a USB/Bluetooth scanner reads straight away: focused when the page
 * loads, when the window comes back, and when a key is pressed while nothing else has the cursor (the
 * scanner's first character then lands in the box). Call the returned refocus after a scan or a dialog closes.
 */
export function useScanField<T extends HTMLInputElement = HTMLInputElement>() {
  const ref = useRef<T>(null);
  const refocus = useCallback(() => {
    requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    const idle = () => !document.activeElement || document.activeElement === document.body;
    const onKey = (e: KeyboardEvent) => {
      if (idle() && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) ref.current?.focus({ preventScroll: true });
    };
    const onFocus = () => idle() && refocus();
    refocus();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("focus", onFocus);
    };
  }, [refocus]);
  return [ref, refocus] as const;
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useOccupancy() {
  const tickets = useStore((s) => s.tickets);
  const zones = useStore((s) => s.zones);
  const bookings = useStore((s) => s.bookings);
  const now = useNow();
  return useMemo(() => {
    const lock = lockoutAt(bookings, now);
    const d = today();
    const m = now.getHours() * 60 + now.getMinutes();
    const partyNow = bookings.find((b) => b.kind === "party" && b.status === "confirmed" && b.date === d && m >= timeToMin(b.start) && m < timeToMin(b.end));
    return zones.map((z) => {
      let inside = tickets.filter((t) => t.zoneId === z.id && t.status === "active").reduce((a, t) => a + t.visitors, 0);
      if (z.kind === "party" && partyNow) inside = partyNow.guests;
      const pct = z.capacity ? inside / z.capacity : 0;
      const locked = z.kind === "play" && !!lock;
      return {
        zone: z,
        inside,
        pct,
        full: inside >= z.capacity,
        nearFull: pct >= z.nearFullPct / 100,
        locked,
        lock,
        available: Math.max(0, z.capacity - inside),
        partyNow: z.kind === "party" ? partyNow : undefined,
      };
    });
  }, [tickets, zones, bookings, now]);
}

export type Alert = { id: string; tone: "rose" | "sun" | "sky" | "lilac"; title: string; text: string; href: string };

export function useAlerts(): Alert[] {
  const occ = useOccupancy();
  const refunds = useStore((s) => s.refunds);
  const products = useStore((s) => s.products);
  const bookings = useStore((s) => s.bookings);
  const now = useNow();
  return useMemo(() => {
    const out: Alert[] = [];
    for (const o of occ) {
      if (o.locked && o.lock)
        out.push({ id: `lock-${o.zone.id}`, tone: "rose", title: `${o.zone.name} locked`, text: `Exclusive party ${o.lock.ref} until ${o.lock.end}. Walk-ins paused.`, href: "/bookings" });
      else if (o.full) out.push({ id: `full-${o.zone.id}`, tone: "rose", title: `${o.zone.name} is full`, text: `${o.inside}/${o.zone.capacity}. New entries are blocked.`, href: "/zones" });
      else if (o.nearFull && o.zone.kind !== "party") out.push({ id: `near-${o.zone.id}`, tone: "sun", title: `${o.zone.name} nearly full`, text: `${Math.round(o.pct * 100)}% occupied — ${o.available} spots left.`, href: "/zones" });
    }
    const d = today();
    const m = now.getHours() * 60 + now.getMinutes();
    bookings
      .filter((b) => b.kind === "party" && b.mode === "full" && b.status === "confirmed" && b.date === d && timeToMin(b.start) - m > 0 && timeToMin(b.start) - m <= 240)
      .forEach((b) =>
        out.push({ id: `soon-${b.id}`, tone: "lilac", title: "Full-venue party today", text: `Play area closes to walk-ins at ${fmtTime(new Date(`${d}T${b.start}`).toISOString()).replace(/^0/, "")} (30 min setup before ${b.start}).`, href: "/bookings" }),
      );
    const pend = refunds.filter((r) => r.status === "pending").length;
    if (pend) out.push({ id: "refunds", tone: "sky", title: `${pend} refund${pend > 1 ? "s" : ""} awaiting approval`, text: "Manager approval required.", href: "/refunds" });
    const low = products.filter((p) => p.active && p.stock <= p.reorderAt);
    if (low.length) out.push({ id: "stock", tone: "sun", title: `${low.length} product${low.length > 1 ? "s" : ""} low on stock`, text: low.slice(0, 3).map((p) => p.name).join(", "), href: "/products" });
    return out;
  }, [occ, refunds, products, bookings, now]);
}
