"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutGrid, Ticket, ScanLine, Shapes, Tags, ShoppingBasket, Package, Wallet, RotateCcw, Users, CalendarHeart,
  BarChart3, MessageCircle, Receipt, Banknote, IdCard, Clock, ShieldCheck, History, Settings, Bell, Menu, LogOut, UserRound, ChevronDown, Globe, X,
} from "lucide-react";
import { useStore, useMe, useCan, useMyShift, useBoot, useLiveSync } from "@/lib/store";
import { useAlerts, useHydrated, useNow } from "@/lib/hooks";
import { cx, fmtTime } from "@/lib/utils";
import { backupToFolder, reconnectFolder, useBackupFolder, useBackupFolderSync, useScheduledFolderBackup } from "@/lib/localBackup";
import { Toaster, Tone, toneCls, toast } from "./ui";
import { format } from "date-fns";

type NavItem = { href: string; label: string; icon: ReactNode; perm: string; tone: Tone };
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Floor",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <LayoutGrid size={18} />, perm: "dashboard.view", tone: "sky" },
      { href: "/front-desk", label: "Front Desk", icon: <Ticket size={18} />, perm: "tickets.sell", tone: "rose" },
      { href: "/sessions", label: "Live Sessions", icon: <ScanLine size={18} />, perm: "tickets.checkout", tone: "mint" },
      { href: "/tickets", label: "Tickets", icon: <Receipt size={18} />, perm: "tickets.view", tone: "lilac" },
      { href: "/zones", label: "Zones & Capacity", icon: <Shapes size={18} />, perm: "zones.view", tone: "teal" },
    ],
  },
  {
    group: "Sales",
    items: [
      { href: "/pos", label: "POS", icon: <ShoppingBasket size={18} />, perm: "pos.sell", tone: "sun" },
      { href: "/products", label: "Products & Stock", icon: <Package size={18} />, perm: "products.edit", tone: "mint" },
      { href: "/shifts", label: "Cashier Shifts", icon: <Wallet size={18} />, perm: "shifts.own", tone: "sky" },
      { href: "/refunds", label: "Refunds", icon: <RotateCcw size={18} />, perm: "refunds.request", tone: "rose" },
    ],
  },
  {
    group: "Guests",
    items: [
      { href: "/customers", label: "Customers", icon: <Users size={18} />, perm: "customers.view", tone: "lilac" },
      { href: "/bookings", label: "Bookings & Parties", icon: <CalendarHeart size={18} />, perm: "bookings.view", tone: "rose" },
      { href: "/whatsapp", label: "WhatsApp", icon: <MessageCircle size={18} />, perm: "whatsapp.send", tone: "mint" },
      { href: "/pricing", label: "Pricing & Promos", icon: <Tags size={18} />, perm: "pricing.edit", tone: "sun" },
    ],
  },
  {
    group: "Money",
    items: [
      { href: "/reports", label: "Reports", icon: <BarChart3 size={18} />, perm: "reports.view", tone: "teal" },
      { href: "/expenses", label: "Expenses", icon: <Banknote size={18} />, perm: "expenses.view", tone: "rose" },
      { href: "/payroll", label: "Payroll", icon: <Wallet size={18} />, perm: "payroll.view", tone: "mint" },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "/staff", label: "Staff", icon: <IdCard size={18} />, perm: "hr.view", tone: "sky" },
      { href: "/attendance", label: "Attendance", icon: <Clock size={18} />, perm: "hr.view", tone: "lilac" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/users", label: "Users & Roles", icon: <ShieldCheck size={18} />, perm: "users.view", tone: "navy" },
      { href: "/activity", label: "Activity Log", icon: <History size={18} />, perm: "activity.view", tone: "teal" },
      { href: "/settings", label: "Settings", icon: <Settings size={18} />, perm: "settings.edit", tone: "gray" },
    ],
  },
];

export function Logo({ className }: { className?: string }) {
  return <Image src="/logo.png" alt="The Playroom — Play, Grow, Shine" width={1380} height={634} priority className={cx("h-auto", className)} />;
}

export default function Shell({ children }: { children: ReactNode }) {
  const mounted = useHydrated();
  const ready = useBoot("app");
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (mounted && ready && !me) router.replace("/login");
  }, [mounted, ready, me, router]);

  if (!mounted || !ready || !me) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {["bg-rose", "bg-sun", "bg-mint", "bg-sky", "bg-lilac"].map((c, i) => (
              <span key={c} className={cx("h-2.5 w-2.5 animate-bounce rounded-full", c)} style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
          <p className="text-sm text-muted">Opening the playroom…</p>
        </div>
      </div>
    );
  }
  return <Frame>{children}</Frame>;
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const backups = useStore((s) => s.settings.backups);
  useLiveSync();
  const settings = useStore((s) => s.settings);
  useBackupFolderSync(backups, can("settings.edit") || can("backups.save"));
  useScheduledFolderBackup(settings, can("settings.edit") || can("backups.save"));

  const nav = (
    <nav className="flex h-full flex-col">
      <Link href="/dashboard" className="block px-5 pb-3 pt-5">
        <Logo className="w-[150px]" />
      </Link>
      <div className="flex-1 overflow-y-auto px-3 pb-4 scroll-thin">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-3">
              <div className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#a39b8c]">{g.group}</div>
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + "/");
                const t = toneCls[i.tone];
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cx(
                      "my-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-bold transition",
                      active ? cx(t.soft, "text-ink") : "text-[#56627a] hover:bg-[#f4f0e8] hover:text-ink",
                    )}
                  >
                    <span className={cx("grid h-7 w-7 place-items-center rounded-lg", active ? cx("bg-white", t.text) : "text-[#8b93a6]")}>{i.icon}</span>
                    {i.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div className="mt-4 border-t border-line px-3 pt-3 text-[12px] text-muted">
          <a href="/book" target="_blank" className="flex items-center gap-2 py-1 font-bold hover:text-navy">
            <Globe size={14} /> Online booking page
          </a>
          <a href="/kiosk" target="_blank" className="flex items-center gap-2 py-1 font-bold hover:text-navy">
            <ScanLine size={14} /> Staff clock-in kiosk
          </a>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-line bg-[#fffdf9] lg:block no-print">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <aside
            className="h-full w-[260px] bg-[#fffdf9]"
            onClick={(e) => {
              e.stopPropagation();
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <TempPasswordNotice />
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const me = useMe()!;
  const roles = useStore((s) => s.roles);
  const logout = useStore((s) => s.logout);
  const alerts = useAlerts();
  const shift = useMyShift();
  const now = useNow(15000);
  const router = useRouter();
  const [menu, setMenu] = useState<null | "alerts" | "user">(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const role = roles.find((r) => r.id === me.roleId);
  const can = useCan();
  const folder = useBackupFolder();
  const folderBackup = useStore((s) => s.folderBackup);
  const canBackup = can("settings.edit") || can("backups.save");

  return (
    <header ref={ref} className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6 lg:px-8 no-print">
      <button onClick={onMenu} className="rounded-lg p-2 text-muted hover:bg-white lg:hidden">
        <Menu size={20} />
      </button>
      <div className="hidden text-sm sm:block">
        <span className="font-display text-[15px] font-medium text-ink">{format(now, "EEEE, d MMMM")}</span>
        <span className="ml-2 text-muted tabular">{format(now, "h:mm a")}</span>
      </div>
      <div className="flex-1" />

      {canBackup && folder.name && folder.access !== "granted" && (
        <button
          onClick={reconnectFolder}
          title={`Allow saving backups to the “${folder.name}” folder on this PC`}
          className="flex items-center gap-2 rounded-full border border-sun bg-sun-soft px-3 py-1.5 text-xs font-bold text-[#8a6510]"
        >
          <span className="h-2 w-2 rounded-full bg-[#d9a520]" />
          Reconnect backup folder
        </button>
      )}

      <Link
        href="/shifts"
        className={cx(
          "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold md:flex",
          shift ? "border-mint bg-mint-soft text-[#2f8f72]" : "border-line bg-white text-muted",
        )}
      >
        <span className={cx("h-2 w-2 rounded-full", shift ? "bg-[#3aa985]" : "bg-[#c9c1b2]")} />
        {shift ? `Shift open since ${fmtTime(shift.openedAt)}` : "No shift open"}
      </Link>

      <div className="relative">
        <button onClick={() => setMenu(menu === "alerts" ? null : "alerts")} className="relative rounded-xl p-2 text-muted hover:bg-white">
          <Bell size={20} />
          {alerts.length > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#e0607b] px-1 text-[10px] font-bold text-white">{alerts.length}</span>}
        </button>
        {menu === "alerts" && (
          <div className="absolute right-0 top-11 w-[340px] rounded-2xl border border-line bg-white p-2 shadow-xl">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="font-display font-medium">Staff alerts</span>
              <button onClick={() => setMenu(null)} className="text-muted">
                <X size={16} />
              </button>
            </div>
            {alerts.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">All calm on the floor.</p>}
            {alerts.map((a) => (
              <Link key={a.id} href={a.href} onClick={() => setMenu(null)} className={cx("mt-1 block rounded-xl px-3 py-2.5", toneCls[a.tone].soft)}>
                <div className={cx("text-sm font-bold", toneCls[a.tone].text)}>{a.title}</div>
                <div className="text-xs text-ink/75">{a.text}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setMenu(menu === "user" ? null : "user")} className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-white">
          <Avatar name={me.name} />
          <div className="hidden text-left leading-tight md:block">
            <div className="text-sm font-bold">{me.name}</div>
            <div className="text-[11px] text-muted">{role?.name}</div>
          </div>
          <ChevronDown size={14} className="text-muted" />
        </button>
        {menu === "user" && (
          <div className="absolute right-0 top-12 w-52 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
            <Link href="/profile" onClick={() => setMenu(null)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold hover:bg-[#f6f2eb]">
              <UserRound size={16} /> My profile
            </Link>
            <button
              onClick={async () => {
                setMenu(null);
                // end of the day: save a backup into this PC's backup folder before signing out
                if (canBackup && folder.name) {
                  toast("Saving the backup…");
                  const r = await backupToFolder("end-of-day", () => folderBackup(`Signed out · ${me.name}`));
                  if (r !== "saved" && !confirm(`The backup couldn't be saved to the “${folder.name}” folder. Sign out anyway?`)) return;
                }
                await logout();
                router.replace("/login");
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#c24f69] hover:bg-rose-soft"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function TempPasswordNotice() {
  const me = useMe();
  const path = usePathname();
  if (!me?.mustChangePassword || path === "/profile") return null;
  return (
    <Link href="/profile" className="mb-5 block rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm font-bold text-[#8a6510] no-print">
      You signed in with a temporary password — set your own password now →
    </Link>
  );
}

const AV = ["bg-sky", "bg-lilac", "bg-mint", "bg-rose", "bg-sun", "bg-teal"];
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const i = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length;
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full font-display font-semibold text-white", AV[i])} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}
