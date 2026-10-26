import { gzipSync } from "node:zlib";
import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { housekeeping } from "@/server/services/admin";
import { loadState } from "@/server/state";

export const GET = handler(async (req) => {
  const actor = await requireActor();
  await housekeeping();
  // ?since=<rev>: only what changed after the revision this screen already has
  const since = req.nextUrl.searchParams.get("since");
  const body = JSON.stringify(await loadState(actor, since && /^\d+$/.test(since) ? Number(since) : undefined));
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Accept-Encoding" };
  // the full data set is MBs of JSON (sent at sign-in and page load); changes are usually tiny
  if (req.headers.get("accept-encoding")?.includes("gzip")) return new Response(gzipSync(body), { headers: { ...headers, "Content-Encoding": "gzip" } });
  return new Response(body, { headers });
});
