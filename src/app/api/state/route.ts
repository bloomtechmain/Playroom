import { gzipSync } from "node:zlib";
import { requireActor } from "@/server/auth";
import { handler } from "@/server/http";
import { housekeeping } from "@/server/services/admin";
import { loadState } from "@/server/state";

export const GET = handler(async (req) => {
  const actor = await requireActor();
  await housekeeping();
  const body = JSON.stringify(await loadState(actor));
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Accept-Encoding" };
  // a couple of MB of JSON; every open screen refetches it when something changes
  if (req.headers.get("accept-encoding")?.includes("gzip")) return new Response(gzipSync(body), { headers: { ...headers, "Content-Encoding": "gzip" } });
  return new Response(body, { headers });
});
