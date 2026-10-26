import "server-only";
import type { NextRequest } from "next/server";
import { HttpError } from "./http";

/**
 * In-memory sliding-window limiter (one server process). Used for sign-in, manager sign-off at the
 * counter and the public pages, which anyone on the internet can reach.
 */
const g = globalThis as unknown as { __playroomLimits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__playroomLimits ??= new Map());

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, list] of hits) if (!list.length || now - list[list.length - 1] > 3_600_000) hits.delete(k);
}

/** Recent hits on `key` within `windowMs`. */
export function recent(key: string, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, list);
  return list.length;
}

export const note = (key: string) => hits.set(key, [...(hits.get(key) ?? []), Date.now()]);
export const clear = (key: string) => hits.delete(key);

/** Count this request and refuse it once `max` requests from the same key arrived within `windowMs`. */
export function limit(key: string, max: number, windowMs: number, message = "Too many requests — wait a few minutes and try again") {
  if (recent(key, windowMs) >= max) throw new HttpError(429, message);
  note(key);
}

/**
 * The caller's IP. Caddy sets X-Forwarded-For to the real client address (it drops whatever the client
 * sent unless the client is a trusted proxy), so the last entry is the one Caddy saw.
 */
export function clientIp(req: NextRequest | Request) {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",").at(-1)?.trim() || req.headers.get("x-real-ip") || "local";
}
