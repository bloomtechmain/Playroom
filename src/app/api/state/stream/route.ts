import { connection } from "next/server";
import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { currentRev } from "@/server/mutation";

/**
 * Server-sent events: pushes the revision number the moment it moves, so open screens — including tabs in
 * the background, whose timers the browser slows down — refresh (and raise notifications) straight away.
 * One shared check of the revision per second serves every open screen.
 */
const listeners = new Set<(rev: number) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let last = -1;

function watch(fn: (rev: number) => void) {
  listeners.add(fn);
  timer ??= setInterval(async () => {
    try {
      const rev = await currentRev();
      if (rev === last) return;
      last = rev;
      listeners.forEach((l) => l(rev));
    } catch {
      // database briefly unavailable: try again next second
    }
  }, 1000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
      last = -1;
    }
  };
}

export const GET = handler(async (req) => {
  await connection();
  await requireActor();
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
      const unwatch = watch((rev) => send(`data: ${rev}\n\n`));
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
