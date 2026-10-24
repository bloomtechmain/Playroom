import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (what = "Record") => new HttpError(404, `${what} not found`);

// Postgres error codes worth turning into a readable 4xx instead of a 500
const PG_ERRORS: Record<string, [number, string]> = {
  "23505": [409, "That already exists (duplicate value)"],
  "23503": [400, "It refers to a record that doesn't exist"],
  "23502": [400, "A required field is missing"],
  "22P02": [400, "A field has an invalid value"],
  "22003": [400, "A number is out of range"],
  "22007": [400, "A date or time is invalid"],
  "22008": [400, "A date or time is invalid"],
};

function toResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError) return Response.json({ error: e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
  const code = (e as { code?: string; cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
  if (code && PG_ERRORS[code]) {
    const [status, error] = PG_ERRORS[code];
    return Response.json({ error }, { status });
  }
  console.error(e);
  return Response.json({ error: "Something went wrong on the server" }, { status: 500 });
}

/** Wraps a route handler: plain return values become JSON, thrown errors become `{ error }` responses. */
export function handler<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      unstable_rethrow(e); // let Next's own control-flow signals (e.g. end of prerender) through
      return toResponse(e);
    }
  };
}

export async function readBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(json);
}
