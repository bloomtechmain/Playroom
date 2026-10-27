"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { DB } from "./seed";
import type { Collections, CollectionKey, Item, Patch } from "./patch";
import { NEWEST_FIRST } from "./patch";
import type { Booking, Employee, PayMethod, RefundRequest, Sale, Settings, Ticket, User } from "./types";
import { toast } from "@/components/ui";

export type { CollectionKey } from "./patch";

/**
 * Client-side cache of the server's data. Screens read collections from here exactly as before;
 * every change goes to the API, and the rows the server returns are merged back in.
 * Other open screens notice the change through the revision poll (see useLiveSync) and refetch.
 */

type Scope = "app" | "login" | "public";
type ApiResult<T> = { patch: Patch; result: T };
export type ClockResult = { ok: boolean; message: string; name?: string; direction?: "in" | "out" };
export type RefundApproval = "queue" | "now" | "manager";
export interface PublicBookingInput {
  kind: "play" | "party";
  date: string;
  start: string;
  packageId?: string;
  mode: "room" | "full";
  guests: number;
  kids: number;
  hours: number;
  addonIds: string[];
  theme: string;
  contact: { name: string; phone: string; email: string; child: string };
}

interface State extends Collections {
  settings: Settings;
  currentUserId?: string;
  /** data for `scope` has been loaded */
  ready: boolean;
  scope?: Scope;
  rev: number;

  // loading & sync
  boot: (scope: Scope) => Promise<void>;
  refresh: () => Promise<void>;
  applyPatch: (p: Patch) => void;

  // auth
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<string | null>;

  // generic records (optimistic)
  save: <K extends CollectionKey>(key: K, item: Item<K>, module: string, label: string, opts?: { quiet?: boolean }) => Promise<boolean>;
  remove: <K extends CollectionKey>(key: K, id: string, module: string, label: string) => Promise<boolean>;
  setSettings: (patch: Partial<Settings>, detail?: string) => Promise<boolean>;

  // admin
  backupNow: () => Promise<DB | null>;
  /** end-of-day snapshot for the PC's backup folder (not stored on the server) */
  folderBackup: (reason: string) => Promise<DB | null>;
  restoreBackup: (snapshot: DB, fileName: string) => Promise<boolean>;

  // money
  openShift: (float: number) => Promise<boolean>;
  closeShift: (counted: number, notes: string) => Promise<string | undefined>;
  topUpWallet: (customerId: string, amount: number, method: PayMethod) => Promise<boolean>;

  // tickets
  /** check in to one or two areas (play / co-work); returns one ticket per area */
  checkIn: (input: { customerId: string; childIds: string[]; adults: number; areas: { zoneId: string; visitors: number }[] }) => Promise<Ticket[] | null>;
  /** check out the whole visit; returns its tickets as charged */
  checkoutVisit: (id: string, opts: { method: PayMethod; points?: number; promoId?: string | null; manualDiscount?: number }) => Promise<Ticket[] | null>;
  cancelTicket: (id: string, reason: string, refundMethod?: PayMethod) => Promise<boolean>;
  reprintTicket: (id: string) => Promise<boolean>;

  // pos & refunds
  recordSale: (items: { productId: string; qty: number }[], discount: number, method: PayMethod, tendered: number, customerId?: string) => Promise<Sale | null>;
  refund: (
    r: Omit<RefundRequest, "id" | "at" | "requestedBy" | "status">,
    approve: RefundApproval,
    manager?: { username: string; password: string },
  ) => Promise<(RefundRequest & { approvedBy?: string }) | null>;
  decideRefund: (id: string, approve: boolean) => Promise<boolean>;

  payPayroll: (runId: string) => Promise<boolean>;

  // bookings
  createBooking: (b: Omit<Booking, "id" | "ref" | "createdAt">, payNow: number, method: PayMethod | "online") => Promise<Booking | null>;
  payBooking: (id: string, amount: number, method: PayMethod) => Promise<boolean>;
  setBookingStatus: (id: string, status: Booking["status"]) => Promise<boolean>;
  bookOnline: (input: PublicBookingInput) => Promise<{ booking?: Booking; error?: string }>;

  // hr
  /** badge scan; `direction` = what the staff member chose (Clock in / Clock out) */
  clockByToken: (token: string, direction?: "in" | "out") => Promise<ClockResult>;
  /** save an employee, optionally creating their login; the one-time password comes back once */
  saveStaff: (employee: Employee, login?: { username: string; roleId: string; email: string }) => Promise<{ employee: Employee; user?: User; tempPassword?: string } | null>;
}

const EMPTY: Collections = {
  roles: [], users: [], zones: [], ratePlans: [], rules: [], promotions: [], customers: [], children: [], tickets: [], transactions: [], products: [], sales: [], packages: [], addons: [], bookings: [], shifts: [], refunds: [], expenses: [], employees: [], attendance: [], payroll: [], activity: [],
};
const EMPTY_SETTINGS = { holidays: [], backups: [] } as unknown as Settings;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Can't reach the server — check the connection and try again");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

// Writes go out one at a time and in order (a new customer must exist before their children…).
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  pending++;
  const run = queue.then(fn, fn).finally(() => pending--);
  queue = run.catch(() => undefined);
  return run;
}
export const hasPendingWrites = () => pending > 0;

const merge = <T extends { id: string }>(list: T[], items: T[], newestFirst: boolean) => {
  const byId = new Map(items.map((x) => [x.id, x]));
  const out = list.map((x) => byId.get(x.id) ?? x);
  const have = new Set(list.map((x) => x.id));
  const fresh = items.filter((x) => !have.has(x.id));
  return newestFirst ? [...fresh.reverse(), ...out] : [...out, ...fresh];
};

export const useStore = create<State>()((set, get) => {
  /** Run a server action; on failure show the reason and resolve to null instead of throwing. */
  async function act<T>(path: string, body?: unknown, opts: { method?: string; quiet?: boolean } = {}): Promise<T | null> {
    try {
      const out = await enqueue(() => api<ApiResult<T>>(path, { body: body ?? {}, method: opts.method }));
      get().applyPatch(out.patch);
      return out.result;
    } catch (e) {
      fail(e, opts.quiet);
      return null;
    }
  }
  function fail(e: unknown, quiet = false) {
    if (e instanceof ApiError && e.status === 401) {
      set({ currentUserId: undefined });
      return;
    }
    if (!quiet) toast(e instanceof Error ? e.message : "Something went wrong", "err");
  }
  /** Optimistic write: show the change immediately, then confirm with the server (or roll back). */
  async function optimistic(apply: () => void, path: string, body: unknown, method = "POST") {
    apply();
    try {
      const out = await enqueue(() => api<ApiResult<unknown>>(path, { body, method }));
      get().applyPatch(out.patch);
      return true;
    } catch (e) {
      fail(e);
      await get().refresh().catch(() => undefined);
      return false;
    }
  }

  return {
    ...EMPTY,
    settings: EMPTY_SETTINGS,
    currentUserId: undefined,
    ready: false,
    scope: undefined,
    rev: 0,

    boot: async (scope) => {
      if (get().scope === scope && get().ready) return;
      set({ ready: false, scope });
      try {
        if (scope === "app") {
          await get().refresh();
        } else if (scope === "login") {
          set({ ...EMPTY, currentUserId: undefined });
        } else {
          const d = await api<Partial<Collections> & { settings: Partial<Settings> }>("/api/public/booking");
          set({ ...EMPTY, ...d, settings: { ...EMPTY_SETTINGS, ...d.settings } as Settings, currentUserId: undefined });
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      }
      if (get().scope === scope) set({ ready: true });
    },

    refresh: async () => {
      const scope = get().scope;
      if (scope === "public") {
        const d = await api<Partial<Collections>>("/api/public/booking").catch(() => null);
        if (d?.bookings) set({ bookings: d.bookings });
        return;
      }
      try {
        // once loaded, ask only for what changed since this screen's revision (the server may still send everything)
        const { rev, currentUserId } = get();
        const s = await api<{ rev: number; currentUserId: string; data?: Collections & { settings: Settings }; patch?: Patch }>(
          currentUserId && rev ? `/api/state?since=${rev}` : "/api/state",
        );
        if (s.patch && s.currentUserId === currentUserId) {
          get().applyPatch(s.patch);
          set({ rev: s.rev });
        } else if (s.data) set({ ...s.data, currentUserId: s.currentUserId, rev: s.rev });
        else {
          // changes for a different user (signed in as someone else in another tab): load everything
          set({ rev: 0, currentUserId: undefined });
          return get().refresh();
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) set({ ...EMPTY, currentUserId: undefined });
        else throw e;
      }
    },

    applyPatch: (p) => {
      if (p.reload) {
        void get().refresh();
        return;
      }
      set((s) => {
        const next: Partial<State> = {};
        for (const [k, items] of Object.entries(p.upsert ?? {}) as [CollectionKey, { id: string }[]][])
          (next as Record<string, unknown>)[k] = merge(s[k] as { id: string }[], items, NEWEST_FIRST.includes(k));
        for (const [k, ids] of Object.entries(p.remove ?? {}) as [CollectionKey, string[]][])
          (next as Record<string, unknown>)[k] = ((next[k] ?? s[k]) as { id: string }[]).filter((x) => !ids.includes(x.id));
        if (p.settings) next.settings = p.settings;
        // stay "in sync" only if nobody else wrote in between; otherwise the poll will refetch
        if (p.rev === s.rev + 1) next.rev = p.rev;
        return next;
      });
    },

    login: async (username, password) => {
      try {
        await api("/api/auth/login", { body: { username, password } });
        set({ scope: "app", ready: false });
        await get().refresh();
        set({ ready: true });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Sign-in failed";
      }
    },
    logout: async () => {
      await api("/api/auth/logout", { body: {} }).catch(() => undefined);
      set({ ...EMPTY, settings: EMPTY_SETTINGS, currentUserId: undefined, scope: undefined, ready: false, rev: 0 });
    },
    changePassword: async (current, next) => {
      try {
        const out = await enqueue(() => api<ApiResult<unknown>>("/api/auth/password", { body: { current, next } }));
        get().applyPatch(out.patch);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Couldn't change the password";
      }
    },

    save: (key, item, module, label, opts) =>
      optimistic(
        () =>
          set((s) => {
            const list = s[key] as { id: string }[];
            const it = item as { id: string };
            return { [key]: list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : NEWEST_FIRST.includes(key) ? [it, ...list] : [...list, it] } as Partial<State>;
          }),
        `/api/records/${key}`,
        { item, module, label, quiet: opts?.quiet },
      ),

    remove: (key, id, module, label) =>
      optimistic(
        () => set((s) => ({ [key]: (s[key] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<State>),
        `/api/records/${key}?${new URLSearchParams({ id, module, label })}`,
        undefined,
        "DELETE",
      ),

    setSettings: (patch, detail) => optimistic(() => set((s) => ({ settings: { ...s.settings, ...patch } })), "/api/settings", { patch, detail }, "PATCH"),

    backupNow: () => act<DB>("/api/backups"),
    folderBackup: (reason) => act<DB>("/api/backups/folder", { reason }),
    restoreBackup: async (snapshot, fileName) => {
      const ok = (await act("/api/backups/restore", { snapshot, fileName })) !== null;
      if (ok) await get().refresh();
      return ok;
    },

    openShift: async (float) => (await act("/api/shifts/open", { float })) !== null,
    closeShift: async (counted, notes) => (await act<string>("/api/shifts/close", { counted, notes })) ?? undefined,
    topUpWallet: async (customerId, amount, method) => (await act(`/api/customers/${customerId}/topup`, { amount, method })) !== null,

    checkIn: (input) => act<Ticket[]>("/api/tickets", input),
    checkoutVisit: (id, opts) => act<Ticket[]>(`/api/tickets/${id}/checkout`, opts),
    cancelTicket: async (id, reason, refundMethod) => (await act(`/api/tickets/${id}/cancel`, { reason, refundMethod })) !== null,
    reprintTicket: async (id) => (await act(`/api/tickets/${id}/reprint`)) !== null,

    recordSale: (items, discount, method, tendered, customerId) => act<Sale>("/api/sales", { items, discount, method, tendered, customerId }),
    refund: (refund, approve, manager) => act("/api/refunds", { refund, approve, manager }),
    decideRefund: async (id, approve) => (await act(`/api/refunds/${id}/decide`, { approve })) !== null,

    payPayroll: async (runId) => (await act(`/api/payroll/${runId}/pay`)) !== null,

    createBooking: (booking, payNow, method) => act<Booking>("/api/bookings", { booking, payNow, method }),
    payBooking: async (id, amount, method) => (await act(`/api/bookings/${id}/pay`, { amount, method })) !== null,
    setBookingStatus: async (id, status) => (await act(`/api/bookings/${id}/status`, { status })) !== null,
    bookOnline: async (input) => {
      try {
        const { booking } = await api<{ booking: Booking }>("/api/public/booking", { body: input });
        set((s) => ({ bookings: [...s.bookings, booking] }));
        return { booking };
      } catch (e) {
        void get().refresh();
        return { error: e instanceof Error ? e.message : "Booking failed" };
      }
    },

    saveStaff: (employee, login) => act("/api/staff", { employee, login }),
    clockByToken: async (token, direction) => {
      try {
        const r = await enqueue(() => api<ClockResult>("/api/attendance/clock", { body: { token, direction } }));
        void get().refresh();
        return r;
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : "Couldn't record the scan" };
      }
    },
  };
});

/** Load the data a page needs (once per scope) and report when it's ready. */
export function useBoot(scope: Scope) {
  const ready = useStore((s) => s.ready && s.scope === scope);
  useEffect(() => {
    void useStore.getState().boot(scope);
  }, [scope]);
  return ready;
}

/**
 * Keep this screen in step with the others (front desk, live sessions…): the server pushes its revision
 * number the moment it moves (/api/state/stream, also in background tabs so notifications arrive at once),
 * and the screen polls it as a fallback while visible; it refetches when somebody else changed something.
 */
export function useLiveSync(ms = 4000) {
  useEffect(() => {
    let stop = false;
    let busy = false;
    let again = false;
    const tick = async (pushed = false) => {
      const s = useStore.getState();
      if (busy && pushed) again = true; // a change arrived mid-refresh: check once more afterwards
      if (busy || stop || hasPendingWrites() || (document.hidden && !pushed) || !s.ready) return;
      busy = true;
      try {
        if (s.scope === "app") {
          const { rev } = await api<{ rev: number }>("/api/state/rev");
          if (rev !== useStore.getState().rev && !hasPendingWrites()) await useStore.getState().refresh();
        } else await s.refresh();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) useStore.setState({ currentUserId: undefined });
      } finally {
        busy = false;
        if (again) {
          again = false;
          void tick(true);
        }
      }
    };
    const t = setInterval(() => void tick(), ms);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    const es = useStore.getState().scope === "app" ? new EventSource("/api/state/stream") : undefined;
    if (es)
      es.onmessage = (e) => {
        if (Number(e.data) !== useStore.getState().rev) void tick(true);
      };
    return () => {
      stop = true;
      clearInterval(t);
      es?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
}

// ---------- selectors / helpers ----------
export const useMe = () => {
  const id = useStore((s) => s.currentUserId);
  const users = useStore((s) => s.users);
  return users.find((u) => u.id === id);
};

export const useCan = () => {
  const me = useMe();
  const roles = useStore((s) => s.roles);
  const role = roles.find((r) => r.id === me?.roleId);
  return (perm: string) => !!role && (role.locked || role.permissions.includes(perm));
};

export const useMyShift = () => {
  const id = useStore((s) => s.currentUserId);
  const shifts = useStore((s) => s.shifts);
  return shifts.find((s) => s.userId === id && !s.closedAt);
};
