import "server-only";
import { sharedPool, transaction as tx, wrap, type Sql } from "./pool";

export type { Row, Sql } from "./pool";

const pool = sharedPool();

export const db: Sql = wrap(pool);
export const transaction = <T>(fn: (sql: Sql) => Promise<T>) => tx(pool, fn);
