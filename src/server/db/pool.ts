import { Pool, types, type PoolClient } from "pg";

export type Row = Record<string, unknown>;

/** The tiny query interface the whole server uses — a pool or a client inside a transaction. */
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>;
}

// timestamptz arrives as "2026-10-22 09:15:00.123+05:30" (or "+00"); the app works with ISO strings
const isoTimestamp = (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();

const PARSERS: Record<number, (v: string) => unknown> = {
  20: Number, // int8 (count(*), sequences, bigserial)
  1700: Number, // numeric — money; values fit comfortably in a double
  1184: isoTimestamp, // timestamptz
  1082: (v) => v, // date stays "yyyy-MM-dd"
};

const getTypeParser = ((oid: number, format?: "text" | "binary") =>
  PARSERS[oid] ?? (types.getTypeParser as (o: number, f?: string) => unknown)(oid, format)) as typeof types.getTypeParser;

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  return new Pool({ connectionString: url, max: 10, types: { getTypeParser } });
}

export function wrap(c: Pool | PoolClient): Sql {
  return {
    query: async <T>(text: string, params?: unknown[]) => (await c.query(text, params)).rows as T[],
    one: async <T>(text: string, params?: unknown[]) => (await c.query(text, params)).rows[0] as T | undefined,
  };
}

/** BEGIN … COMMIT around `fn`; any error rolls everything back. */
export async function transaction<T>(pool: Pool, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(wrap(client));
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** The one pool per server process (shared by route handlers and the WhatsApp worker; survives dev hot reloads). */
export function sharedPool(): Pool {
  const g = globalThis as unknown as { __playroomPool?: Pool };
  return (g.__playroomPool ??= createPool());
}
