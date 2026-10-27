"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, LogIn, LogOut, ScanLine, XCircle } from "lucide-react";
import { create } from "zustand";
import { useStore, type ClockResult } from "@/lib/store";
import { useScanField } from "@/lib/hooks";
import { cx } from "@/lib/utils";
import { Input, Modal } from "./ui";

/** Open / close the staff attendance window from anywhere (top bar, sidebar, Attendance page). */
export const useStaffClock = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

/**
 * Staff clock in / out at the front desk: the staff member chooses Clock in or Clock out, then holds their
 * badge to the QR reader (it types the code and presses Enter). The choice stays for the next person
 * until someone changes it, and the window stays open.
 */
export function StaffClockModal() {
  const { open, set } = useStaffClock();
  if (!open) return null;
  return <Clock onClose={() => set(false)} />;
}

type Scan = ClockResult & { at: number };

function Clock({ onClose }: { onClose: () => void }) {
  const clock = useStore((s) => s.clockByToken);
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Scan | null>(null);
  const [recent, setRecent] = useState<Scan[]>([]);
  const [scanRef, refocus] = useScanField();

  // the result shows for a few seconds, then the window is ready for the next person
  useEffect(() => {
    if (!res) return;
    const t = setTimeout(() => setRes(null), 5000);
    return () => clearTimeout(t);
  }, [res]);

  const scan = async (text: string) => {
    const token = text.trim();
    setCode("");
    if (!token || busy) return;
    if (!mode) {
      setRes({ ok: false, message: "Choose Clock in or Clock out first, then scan again", at: Date.now() });
      return refocus();
    }
    setBusy(true);
    const r = { ...(await clock(token, mode)), at: Date.now() };
    setBusy(false);
    setRes(r);
    if (r.ok) setRecent((x) => [r, ...x].slice(0, 5));
    refocus();
  };

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><ScanLine size={18} /> Staff attendance</span>} width="max-w-md">
      <div className="mb-4 grid grid-cols-2 gap-3">
        {(["in", "out"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setMode(d);
              setRes(null);
              refocus();
            }}
            className={cx(
              "flex items-center justify-center gap-2 rounded-2xl border-2 py-4 font-display text-lg font-semibold transition",
              mode === d ? (d === "in" ? "border-[#3aa985] bg-mint-soft text-[#2f8f72]" : "border-navy bg-sky-soft text-navy") : "border-line bg-white text-muted hover:bg-[#faf7f1]",
            )}
          >
            {d === "in" ? <LogIn size={20} /> : <LogOut size={20} />} {d === "in" ? "Clock in" : "Clock out"}
          </button>
        ))}
      </div>
      {res ? (
        <div className={cx("flex flex-col items-center rounded-2xl p-6 text-center", res.ok ? (res.direction === "in" ? "bg-mint-soft" : "bg-sky-soft") : "bg-rose-soft")}>
          {res.ok ? <CheckCircle2 size={48} className={res.direction === "in" ? "text-[#3aa985]" : "text-navy"} /> : <XCircle size={48} className="text-[#e0607b]" />}
          {res.name && <div className="mt-3 font-display text-2xl font-semibold">{res.name.split(" ")[0]}</div>}
          <div className="mt-1">{res.message}</div>
          <div className="mt-1 text-sm text-muted">{format(new Date(res.at), "h:mm a")}</div>
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-line p-6 text-center">
          <ScanLine size={40} className="text-navy" />
          <div className="mt-3 font-display text-xl font-semibold text-navy">{mode ? "Place your QR badge on the QR reader" : "Choose Clock in or Clock out"}</div>
          <p className="mt-1 text-sm text-muted">{mode ? `Scanning now will ${mode === "in" ? "clock you in" : "clock you out"}.` : "Then hold your QR badge to the QR reader."}</p>
        </div>
      )}
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void scan(code);
        }}
      >
        <Input ref={scanRef} autoFocus placeholder={busy ? "Recording…" : "Waiting for a badge scan…"} value={code} onChange={(e) => setCode(e.target.value)} onBlur={refocus} />
      </form>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#3aa985]" /> QR reader ready — no typing needed
      </p>
      {recent.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          {recent.map((r) => (
            <div key={r.at} className="flex justify-between">
              <span className="font-bold">{r.name}</span>
              <span className={r.direction === "in" ? "text-[#2f8f72]" : "text-navy"}>
                {r.direction === "in" ? "In" : "Out"} {format(new Date(r.at), "h:mm a")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
