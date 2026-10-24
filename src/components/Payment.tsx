"use client";

import { Banknote, CreditCard, Landmark, QrCode, WalletCards } from "lucide-react";
import type { PayMethod } from "@/lib/types";
import { cx, money } from "@/lib/utils";
import { Input } from "./ui";

const METHODS: { id: PayMethod; label: string; icon: React.ReactNode }[] = [
  { id: "cash", label: "Cash", icon: <Banknote size={16} /> },
  { id: "card", label: "Card", icon: <CreditCard size={16} /> },
  { id: "digital", label: "LankaQR", icon: <QrCode size={16} /> },
  { id: "transfer", label: "Transfer", icon: <Landmark size={16} /> },
  { id: "wallet", label: "Wallet", icon: <WalletCards size={16} /> },
];

export function PaymentPicker({
  method,
  onMethod,
  total,
  tendered,
  onTendered,
  walletBalance,
  hide = [],
}: {
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  total: number;
  tendered?: string;
  onTendered?: (v: string) => void;
  walletBalance?: number;
  hide?: PayMethod[];
}) {
  const list = METHODS.filter((m) => !hide.includes(m.id) && (m.id !== "wallet" || walletBalance !== undefined));
  const change = (Number(tendered) || 0) - total;
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {list.map((m) => {
          const disabled = m.id === "wallet" && (walletBalance ?? 0) < total;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onMethod(m.id)}
              className={cx(
                "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition disabled:opacity-40",
                method === m.id ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-sky",
              )}
            >
              {m.icon}
              {m.label}
            </button>
          );
        })}
      </div>
      {method === "wallet" && walletBalance !== undefined && (
        <p className="mt-2 text-xs text-muted">Wallet balance {money(walletBalance)} → {money(walletBalance - total)} after payment</p>
      )}
      {method === "cash" && onTendered && (
        <div className="mt-3 grid grid-cols-2 items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-bold text-ink/80">Cash received</span>
            <Input type="number" value={tendered} onChange={(e) => onTendered(e.target.value)} placeholder={String(total)} />
          </label>
          <div className={cx("rounded-xl px-3 py-2 text-sm", change >= 0 ? "bg-mint-soft" : "bg-rose-soft")}>
            <div className="text-xs text-muted">Change</div>
            <div className="font-display text-lg font-semibold tabular">{tendered ? money(Math.max(0, change)) : "—"}</div>
          </div>
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {[total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000]
              .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
              .map((v) => (
                <button key={v} type="button" onClick={() => onTendered(String(v))} className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-bold hover:border-sky">
                  {money(v)}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
