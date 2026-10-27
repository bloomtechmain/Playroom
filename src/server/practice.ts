import { AsyncLocalStorage } from "node:async_hooks";
import { HttpError } from "./http";

/**
 * Practice mode: a browser that has the practice cookie works on a separate copy of the database
 * (playroom_practice), so staff can try anything without touching real sales, stock or customers.
 * Every API request runs inside `practiceMode` (see `handler`); `db` / `transaction` pick the database from it.
 * Signing in, sessions and permissions always come from the real database.
 */
export const PRACTICE_COOKIE = "pr_practice";

const g = globalThis as unknown as { __playroomPractice?: AsyncLocalStorage<boolean> };
export const practiceMode = (g.__playroomPractice ??= new AsyncLocalStorage<boolean>());

export const inPractice = () => practiceMode.getStore() === true;

/** Run `fn` against the real database, whatever mode the request is in (sign-in, sign-out, audit of mode changes). */
export const onRealData = <T>(fn: () => T) => practiceMode.run(false, fn);

/** Refuse things that reach outside the app (backup files, the WhatsApp phone) while practising. */
export function notInPractice(what: string) {
  if (inPractice()) throw new HttpError(400, `${what} is switched off in practice mode — leave practice mode first`);
}
