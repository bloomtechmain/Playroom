import type { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { isCollection } from "@/server/collections";
import { badRequest, handler, readBody } from "@/server/http";
import { mutate } from "@/server/mutation";
import { recordBody } from "@/server/schemas";
import { removeRecord, saveRecord } from "@/server/services/records";

type Ctx = { params: Promise<{ key: string }> };

async function collection(ctx: Ctx) {
  const { key } = await ctx.params;
  if (!isCollection(key)) throw badRequest(`Unknown collection ${key}`);
  return key;
}

/** Create or update one record (permission rules per collection live in services/records). */
export const POST = handler<Ctx>(async (req, ctx) => {
  const key = await collection(ctx);
  const actor = await requireActor();
  const b = await readBody(req, recordBody);
  return mutate(actor, (m) => saveRecord(m, key, b.item as never, b.module, b.label, { quiet: b.quiet }));
});

export const DELETE = handler<Ctx>(async (req: NextRequest, ctx) => {
  const key = await collection(ctx);
  const actor = await requireActor();
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  if (!id) throw badRequest("Missing id");
  return mutate(actor, (m) => removeRecord(m, key, id, q.get("module") ?? key, q.get("label") ?? id));
});
