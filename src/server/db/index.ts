import "server-only";
import type { Pool } from "pg";
import { inPractice } from "../practice";
import { createPool, sharedPool, transaction as tx, wrap, type Sql } from "./pool";

export type { Row, Sql } from "./pool";

/** The practice copy: PRACTICE_DATABASE_URL, or the real database's name + "_practice" on the same server. */
export function practiceUrl() {
  if (process.env.PRACTICE_DATABASE_URL) return process.env.PRACTICE_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `${url.pathname.replace(/\/$/, "")}_practice`;
  return url.toString();
}

export function practicePool(): Pool {
  const g = globalThis as unknown as { __playroomPracticePool?: Pool };
  return (g.__playroomPracticePool ??= createPool(practiceUrl()));
}

/** The database this request works on. */
const pool = () => (inPractice() ? practicePool() : sharedPool());

export const db: Sql = {
  query: <T>(text: string, params?: unknown[]) => wrap(pool()).query<T>(text, params),
  one: <T>(text: string, params?: unknown[]) => wrap(pool()).one<T>(text, params),
};
export const transaction = <T>(fn: (sql: Sql) => Promise<T>) => tx(pool(), fn);

/** Always the real database (sign-in, sessions, permissions). */
export const realDb: Sql = wrap(sharedPool());
export const practiceDb = (): Sql => wrap(practicePool());
