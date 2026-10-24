"use client";

import Link from "next/link";
import { X, Lock } from "lucide-react";
import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { create } from "zustand";
import { cx } from "@/lib/utils";

export type Tone = "sky" | "lilac" | "mint" | "rose" | "sun" | "teal" | "navy" | "gray";

export const toneCls: Record<Tone, { soft: string; dot: string; text: string; ring: string }> = {
  sky: { soft: "bg-sky-soft", dot: "bg-sky", text: "text-[#3570ad]", ring: "border-sky" },
  lilac: { soft: "bg-lilac-soft", dot: "bg-lilac", text: "text-[#7a5fb0]", ring: "border-lilac" },
  mint: { soft: "bg-mint-soft", dot: "bg-mint", text: "text-[#2f8f72]", ring: "border-mint" },
  rose: { soft: "bg-rose-soft", dot: "bg-rose", text: "text-[#c24f69]", ring: "border-rose" },
  sun: { soft: "bg-sun-soft", dot: "bg-sun", text: "text-[#a37812]", ring: "border-sun" },
  teal: { soft: "bg-teal-soft", dot: "bg-teal", text: "text-[#2b8c95]", ring: "border-teal" },
  navy: { soft: "bg-sky-soft", dot: "bg-navy", text: "text-navy", ring: "border-navy" },
  gray: { soft: "bg-[#f1eee8]", dot: "bg-[#b9b2a5]", text: "text-muted", ring: "border-line" },
};

export function Sparks({ className }: { className?: string }) {
  return (
    <span className={cx("sparks", className)} aria-hidden>
      <i className="w-3 bg-rose" style={{ transform: "rotate(-18deg)" }} />
      <i className="w-4 bg-sun" />
      <i className="w-3 bg-sky" style={{ transform: "rotate(18deg)" }} />
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <Sparks />
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-navy">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "success";
export function Button({
  variant = "primary",
  size = "md",
  className,
  icon,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variant === "primary" && "bg-navy text-white hover:bg-navy-dark shadow-[0_2px_0_#22416f]",
        variant === "secondary" && "border border-line bg-white text-ink hover:border-[#d8d0c2] hover:bg-[#fdfcfa]",
        variant === "ghost" && "text-muted hover:bg-[#f3efe8] hover:text-ink",
        variant === "danger" && "bg-[#e0607b] text-white hover:bg-[#cf4e6a] shadow-[0_2px_0_#b8435c]",
        variant === "success" && "bg-[#3aa985] text-white hover:bg-[#2f9675] shadow-[0_2px_0_#2a7e63]",
        variant === "soft" && "bg-sky-soft text-navy hover:bg-[#dcebfa]",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-white shadow-[0_1px_0_#ece6db]", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {action}
        </header>
      )}
      <div className={cx(pad && "p-5")}>{children}</div>
    </section>
  );
}

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t = toneCls[tone];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", t.soft, t.text, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-bold text-ink/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-[#a9a294] focus:border-sky focus:ring-4 focus:ring-sky/20 transition";

// let callers override width/height without fighting the defaults
const fieldCls = (className?: string) => {
  let base = inputCls;
  if (className && /(^|\s)w-/.test(className)) base = base.replace("w-full ", "");
  if (className && /(^|\s)h-/.test(className)) base = base.replace("h-10 ", "");
  return cx(base, className);
};

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={fieldCls(className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(fieldCls(className), "pr-8")}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls.replace("h-10 ", ""), "min-h-[76px] py-2", className)} />;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex cursor-pointer select-none items-center gap-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-[#3aa985]" : "bg-[#dcd5c8]")}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-lg", footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1f2d4a]/35 p-4 pt-[6vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={cx("w-full rounded-2xl border border-line bg-white shadow-xl", width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5 no-print">
          <h3 className="text-lg font-semibold text-navy">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#f3efe8]">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-[#fcfbf8] px-5 py-3 rounded-b-2xl no-print">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "sky", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  const t = toneCls[tone];
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_0_#ece6db]">
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-bold text-muted">{label}</span>
        {icon && <span className={cx("grid h-8 w-8 place-items-center rounded-xl", t.soft, t.text)}>{icon}</span>}
      </div>
      <div className="mt-1.5 font-display text-[26px] font-semibold leading-none text-ink tabular">{value}</div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            "rounded-lg px-3.5 py-1.5 text-sm font-bold transition",
            value === i.value ? "bg-navy text-white" : "text-muted hover:bg-[#f5f1ea] hover:text-ink",
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto scroll-thin", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-[#f2eee6] [&>tr:last-child]:border-0 [&_td]:whitespace-nowrap [&_td]:px-4 [&_td]:py-2.5 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&>tr:hover]:bg-[#fcfaf6]">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex w-fit gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rose" />
        <span className="h-2 w-2 rounded-full bg-sun" />
        <span className="h-2 w-2 rounded-full bg-mint" />
      </div>
      <p className="font-display text-base font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Shown instead of a screen that can't work until something is configured (e.g. no zones yet). */
export function SetupNeeded({ title, hint, href, cta }: { title: string; hint: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#d6cdbd] bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex w-fit gap-1.5">
        <span className="h-2 w-2 rounded-full bg-sky" />
        <span className="h-2 w-2 rounded-full bg-lilac" />
        <span className="h-2 w-2 rounded-full bg-mint" />
      </div>
      <p className="font-display text-lg font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p>
      {href && (
        <Link href={href} className="mt-4 inline-flex rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_0_#22416f] hover:brightness-110">
          {cta ?? "Set it up"}
        </Link>
      )}
    </div>
  );
}

export function NoAccess({ what }: { what?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-white p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-rose-soft text-[#c24f69]">
        <Lock size={22} />
      </div>
      <h2 className="text-xl font-semibold text-navy">No access</h2>
      <p className="mt-1 text-sm text-muted">Your role doesn&apos;t include {what ?? "this area"}. Ask an administrator to update your permissions.</p>
    </div>
  );
}

export function Meter({ value, max, warnAt = 0.8 }: { value: number; max: number; warnAt?: number }) {
  const pct = max ? Math.min(1, value / max) : 0;
  const color = pct >= 1 ? "bg-[#e0607b]" : pct >= warnAt ? "bg-sun" : "bg-mint";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#f1ece3]">
      <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

// ---- toasts ----
interface ToastState {
  items: { id: number; text: string; tone: "ok" | "err" }[];
  push: (text: string, tone?: "ok" | "err") => void;
}
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, tone = "ok") => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3200);
  },
}));
export const toast = (text: string, tone: "ok" | "err" = "ok") => useToast.getState().push(text, tone);

export function Toaster() {
  const items = useToast((s) => s.items);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2 no-print">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-lg",
            t.tone === "ok" ? "border-mint bg-white text-ink" : "border-rose bg-rose-soft text-[#a63a54]",
          )}
        >
          <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", t.tone === "ok" ? "bg-[#3aa985]" : "bg-[#e0607b]")} />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Counter({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-white">
      <button className="h-9 w-9 text-lg font-bold text-muted hover:text-ink" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="w-8 text-center font-bold tabular">{value}</span>
      <button className="h-9 w-9 text-lg font-bold text-muted hover:text-ink" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
