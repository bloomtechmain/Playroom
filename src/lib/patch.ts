import type { DB } from "./seed";

export type Collections = Omit<DB, "settings" | "seededAt">;
export type CollectionKey = keyof Collections;
export type Item<K extends CollectionKey> = Collections[K][number];

/** What every write endpoint returns: the rows it created/changed/deleted, so the client can merge them. */
export interface Patch {
  rev: number;
  upsert?: { [K in CollectionKey]?: Collections[K] };
  remove?: { [K in CollectionKey]?: string[] };
  settings?: DB["settings"];
  /** the whole data set was replaced (restore / reset) — reload everything */
  reload?: boolean;
}

/** Collections the UI keeps newest-first. */
export const NEWEST_FIRST: CollectionKey[] = ["activity", "refunds"];
