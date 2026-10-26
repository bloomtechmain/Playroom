"use client";

/**
 * Backups saved into a folder on this PC (Chrome / Edge File System Access API). The manager picks the
 * folder once in Settings; the folder handle is kept in this browser's IndexedDB. From then on:
 *  - signing out / closing a shift saves the end-of-day backup there (one file per day, the latest wins),
 *  - "Back up now" saves there without asking where,
 *  - every daily server backup that isn't in the folder yet is copied there whenever the app is open,
 *  - twice a day (Settings → Backups, default 13:00 and 19:30) the backup is saved automatically while the
 *    app is open — a time missed while the PC was off is saved when the app is next opened that day,
 *  - files older than the kept days (default 60) are deleted automatically.
 */

import { useEffect, useSyncExternalStore } from "react";
import { format } from "date-fns";
import type { Settings } from "./types";

// not in TypeScript's DOM lib yet
type Access = "granted" | "prompt" | "denied";
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(o: { mode: "readwrite" }): Promise<Access>;
  requestPermission(o: { mode: "readwrite" }): Promise<Access>;
  keys(): AsyncIterable<string>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (o?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<DirHandle>;
  }
}

export const backupFileName = (at: string) => `playroom-backup-${format(new Date(at), "yyyy-MM-dd-HHmm")}.json`;
const endOfDayName = (d: Date) => `playroom-backup-${format(d, "yyyy-MM-dd")}-end-of-day.json`;

export const folderSupported = () => typeof window !== "undefined" && !!window.showDirectoryPicker && typeof indexedDB !== "undefined";

// ---------------------------------------------------------------- the folder handle, kept in IndexedDB

const DB_NAME = "playroom-local";
const KEY = "backup-dir";

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const req = run(open.result.transaction("kv", mode).objectStore("kv"));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

// ---------------------------------------------------------------- shared status (Settings card + top bar)

export interface FolderState {
  /** folder name, when one is chosen on this PC */
  name?: string;
  access?: Access;
  lastSaved?: string;
  saving: boolean;
  error?: string;
}

let dir: DirHandle | undefined;
let state: FolderState = { saving: false };
const listeners = new Set<() => void>();
const emit = (p: Partial<FolderState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER_STATE: FolderState = { saving: false };
export const useBackupFolder = () => useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
/** The current status outside React (e.g. right after choosing a folder in a click handler). */
export const folderState = () => state;

let loaded: Promise<void> | undefined;
function load() {
  loaded ??= (async () => {
    if (!folderSupported()) return;
    dir = await idb<DirHandle>("readonly", (s) => s.get(KEY));
    if (dir) emit({ name: dir.name, access: await dir.queryPermission({ mode: "readwrite" }).catch(() => "prompt" as const) });
  })();
  return loaded;
}

/** Let the manager choose the backup folder (needs a click). */
export async function chooseFolder() {
  if (!window.showDirectoryPicker) return false;
  try {
    const h = await window.showDirectoryPicker({ id: "playroom-backups", mode: "readwrite", startIn: "documents" });
    await idb("readwrite", (s) => s.put(h, KEY));
    dir = h;
    emit({ name: h.name, access: "granted", error: undefined });
    return true;
  } catch {
    return false; // cancelled
  }
}

export async function forgetFolder() {
  await idb("readwrite", (s) => s.delete(KEY));
  dir = undefined;
  emit({ name: undefined, access: undefined, lastSaved: undefined, error: undefined });
}

/** After the browser restarts it may ask again before writing to the folder (needs a click). */
export async function reconnectFolder() {
  await load();
  if (!dir) return false;
  const access = await dir.requestPermission({ mode: "readwrite" }).catch(() => "denied" as const);
  emit({ access });
  return access === "granted";
}

async function exists(d: DirHandle, name: string) {
  try {
    await d.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function write(d: DirHandle, name: string, text: string) {
  const w = await (await d.getFileHandle(name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

export type FolderResult = "saved" | "no-folder" | "no-access" | "failed";

/**
 * Save a backup into the folder. `snapshot` is fetched only once the folder is usable. Call it straight
 * from a click: if the browser needs permission again it asks then (it can only ask during a click).
 */
export async function backupToFolder(kind: "end-of-day" | "now", snapshot: () => Promise<unknown | null>): Promise<FolderResult> {
  await load();
  if (!dir) return "no-folder";
  if (state.access !== "granted" && !(await reconnectFolder())) return "no-access";
  emit({ saving: true });
  try {
    const data = await snapshot();
    if (!data) throw new Error("The server didn't send the backup");
    const now = new Date();
    await write(dir, kind === "end-of-day" ? endOfDayName(now) : backupFileName(now.toISOString()), JSON.stringify(data));
    emit({ saving: false, lastSaved: now.toISOString(), error: undefined });
    return "saved";
  } catch (e) {
    emit({ saving: false, error: e instanceof Error ? e.message : "Couldn't write to the backup folder" });
    return "failed";
  }
}

let syncing = false;

/** Copy every daily server backup that isn't in the folder yet (manual ones are saved directly). Returns how many files were written. */
export async function syncFolder(backups: Settings["backups"]) {
  await load();
  if (!dir || state.access !== "granted" || syncing) return 0;
  syncing = true;
  emit({ saving: true });
  let n = 0;
  try {
    for (const b of backups) {
      if (!b.auto || !b.id || b.id.startsWith("seed-")) continue;
      const name = backupFileName(b.at);
      if (await exists(dir, name)) continue;
      const res = await fetch(`/api/backups/${b.id}`, { cache: "no-store" });
      if (!res.ok) continue; // pruned on the server meanwhile
      await write(dir, name, await res.text());
      n++;
    }
    emit({ saving: false, error: undefined, ...(n ? { lastSaved: new Date().toISOString() } : {}) });
  } catch (e) {
    emit({ saving: false, error: e instanceof Error ? e.message : "Couldn't write to the backup folder" });
  } finally {
    syncing = false;
  }
  return n;
}

/** Runs in the app frame: whenever the server's backup list changes, copy new backups into the folder. */
export function useBackupFolderSync(backups: Settings["backups"], enabled: boolean) {
  const { access } = useBackupFolder();
  const latest = backups.at(-1)?.id;
  useEffect(() => {
    if (!enabled) return;
    load().then(() => syncFolder(backups));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when a new backup appears or access is granted
  }, [enabled, latest, access]);
}

// ---------------------------------------------------------------- scheduled saves + clean-up

/** Settings → Backups: when the PC saves on its own, and how long the files are kept. */
export const backupSchedule = (settings: Settings) => ({ times: ["13:00", "19:30"], keepDays: 60, ...settings.localBackup });

const scheduledName = (day: Date, time: string) => `playroom-backup-${format(day, "yyyy-MM-dd")}-${time.replace(":", "")}.json`;
const FILE_DAY = /^playroom-backup-(\d{4}-\d{2}-\d{2})/;

async function fetchSnapshot() {
  const res = await fetch("/api/backups/folder", { cache: "no-store" });
  return res.ok ? ((await res.json()) as unknown) : null;
}

/** Delete this app's backup files older than `keepDays` (other files in the folder are never touched). */
async function cleanUp(d: DirHandle, keepDays: number) {
  if (!(keepDays > 0)) return;
  const cutoff = format(new Date(Date.now() - keepDays * 86_400_000), "yyyy-MM-dd");
  const old: string[] = [];
  for await (const name of d.keys()) {
    const day = FILE_DAY.exec(name)?.[1];
    if (day && day < cutoff) old.push(name);
  }
  for (const name of old) await d.removeEntry(name).catch(() => undefined);
}

let cleanedOn = "";

/**
 * Runs in the app frame: once a minute, for each backup time of the day that has passed, save the
 * backup if its file isn't in the folder yet — so a time missed while the PC was off is saved as soon
 * as the app is opened again that day. Old files are cleaned up once a day. Never asks for anything:
 * when the browser needs permission again it waits for the next sign-out / shift close / "Reconnect" click.
 */
export function useScheduledFolderBackup(settings: Settings, enabled: boolean) {
  const { access } = useBackupFolder();
  const { times, keepDays } = backupSchedule(settings);
  const key = `${times.join(",")}|${keepDays}`;
  useEffect(() => {
    if (!enabled || access !== "granted") return;
    const tick = async () => {
      await load();
      if (!dir || state.access !== "granted" || state.saving) return;
      const now = new Date();
      const hhmm = format(now, "HH:mm");
      for (const t of times) {
        if (t > hhmm || (await exists(dir, scheduledName(now, t)))) continue;
        emit({ saving: true });
        try {
          const data = await fetchSnapshot();
          if (!data) throw new Error("The server didn't send the backup");
          await write(dir, scheduledName(now, t), JSON.stringify(data));
          emit({ saving: false, lastSaved: now.toISOString(), error: undefined });
        } catch (e) {
          emit({ saving: false, error: e instanceof Error ? e.message : "Couldn't write to the backup folder" });
          return;
        }
      }
      const today = format(now, "yyyy-MM-dd");
      if (cleanedOn !== today) {
        cleanedOn = today;
        await cleanUp(dir, keepDays).catch(() => undefined);
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for times + keepDays
  }, [enabled, access, key]);
}
