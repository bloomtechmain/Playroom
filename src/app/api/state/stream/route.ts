import { connection } from "next/server";
import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { practiceDb, realDb } from "@/server/db";
import { inPractice } from "@/server/practice";
import { readVersion } from "@/server/rev";

/**
 * Server-sent events: pushes the revision number the moment it moves, so open screens — including tabs in
 * the background, whose timers the browser slows down — refresh (and raise notifications) straight away.
 * One shared check of the revision per second serves every open screen.
 */
interface Watcher {
  listeners: Set<(rev: number) => void>;
  timer?: ReturnType<typeof setInterval>;
  last: number;
}
// one per database: screens in practice mode follow the practice copy
const watchers = { real: { listeners: new Set(), last: -1 } as Watcher, practice: { listeners: new Set(), last: -1 } as Watcher };

function watch(practice: boolean, fn: (rev: number) => void) {
  const w = practice ? watchers.practice : watchers.real;
  w.listeners.add(fn);
  w.timer ??= setInterval(async () => {
    try {
      const { rev } = await readVersion(practice ? practiceDb() : realDb);
      if (rev === w.last) return;
      w.last = rev;
      w.listeners.forEach((l) => l(rev));
    } catch {
      // database briefly unavailable: try again next second
    }
  }, 1000);
  return () => {
    w.listeners.delete(fn);
    if (!w.listeners.size && w.timer) {
      clearInterval(w.timer);
      w.timer = undefined;
      w.last = -1;
    }
  };
}

export const GET = handler(async (req) => {
  await connection();
  await requireActor();
  const practice = inPractice();
  const last = (practice ? watchers.practice : watchers.real).last;
  const enc = new TextEncoder();
  let stop = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const send = (s: string) => {
        try {
          c.enqueue(enc.encode(s));
        } catch {
          stop();
        }
      };
      send(last < 0 ? "retry: 3000\n\n" : `retry: 3000\ndata: ${last}\n\n`);
      const unwatch = watch(practice, (rev) => send(`data: ${rev}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 25_000); // keeps proxies from closing an idle stream
      stop = () => {
        unwatch();
        clearInterval(ping);
        try {
          c.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", () => stop());
    },
    cancel: () => stop(),
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
