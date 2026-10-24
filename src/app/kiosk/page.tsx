"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, LogIn, LogOut, XCircle } from "lucide-react";
import { useBoot, useLiveSync, useStore, type ClockResult } from "@/lib/store";
import { useHydrated, useNow } from "@/lib/hooks";
import { cx, fmtTime, today } from "@/lib/utils";
import QRScanner from "@/components/QRScanner";
import { Logo, Avatar } from "@/components/Shell";

export default function KioskPage() {
  const mounted = useHydrated();
  const ready = useBoot("kiosk");
  if (!mounted || !ready) return null;
  return <Kiosk />;
}

function Kiosk() {
  const now = useNow(1000);
  const clock = useStore((s) => s.clockByToken);
  const employees = useStore((s) => s.employees);
  const attendance = useStore((s) => s.attendance);
  const [res, setRes] = useState<(ClockResult & { at: number }) | null>(null);
  const [demo, setDemo] = useState(false);
  useLiveSync(15000);

  useEffect(() => {
    if (!res) return;
    const t = setTimeout(() => setRes(null), 5000);
    return () => clearTimeout(t);
  }, [res]);

  const scan = useCallback(async (text: string) => {
    const at = Date.now();
    setRes({ ...(await clock(text)), at });
  }, [clock]);

  // Hardware QR scanner: it "types" the badge content very fast and presses Enter.
  // Listen for that burst in the background; slow manual typing is ignored.
  useEffect(() => {
    let buf = "";
    let first = 0;
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = Date.now();
      if (t - last > 100) {
        buf = "";
        first = t;
      }
      last = t;
      if (e.key === "Enter") {
        const fast = buf.length >= 6 && (t - first) / buf.length < 35;
        if (fast) void scan(buf);
        buf = "";
        return;
      }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scan]);
  const recent = attendance
    .filter((a) => a.date === today())
    .flatMap((a) => [{ id: a.id + "i", emp: a.employeeId, at: a.clockIn, dir: "in" as const }, ...(a.clockOut ? [{ id: a.id + "o", emp: a.employeeId, at: a.clockOut, dir: "out" as const }] : [])])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-[#fffdf9]">
      <div className="flex h-2">{["bg-navy", "bg-sky", "bg-lilac", "bg-mint", "bg-rose", "bg-sun", "bg-teal"].map((c) => <span key={c} className={cx("flex-1", c)} />)}</div>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex items-center justify-between">
            <Logo className="w-[180px]" />
            <div className="text-right">
              <div className="font-display text-5xl font-semibold tabular text-navy">{format(now, "h:mm")}<span className="text-2xl text-muted">{format(now, ":ss a")}</span></div>
              <div className="text-muted">{format(now, "EEEE, d MMMM yyyy")}</div>
            </div>
          </div>
          <h1 className="mt-8 text-3xl font-semibold text-navy">Staff clock in / out</h1>
          <p className="text-muted">Scan your badge QR on the scanner, or hold it up to the camera. First scan clocks you in, the next one clocks you out.</p>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
            <div>
              <QRScanner onScan={scan} height={300} />
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#3aa985]" /> QR scanner ready — no typing needed
              </p>
            </div>
            <div className="flex items-stretch">
              {res ? (
                <div className={cx("flex w-full flex-col items-center justify-center rounded-3xl p-8 text-center", res.ok ? (res.direction === "in" ? "bg-mint-soft" : "bg-sky-soft") : "bg-rose-soft")}>
                  {res.ok ? <CheckCircle2 size={56} className={res.direction === "in" ? "text-[#3aa985]" : "text-navy"} /> : <XCircle size={56} className="text-[#e0607b]" />}
                  {res.name && <div className="mt-4 font-display text-3xl font-semibold">{res.name.split(" ")[0]}</div>}
                  <div className="mt-1 text-lg">{res.message}</div>
                  <div className="mt-2 text-sm text-muted">{format(new Date(res.at), "h:mm a")}</div>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line p-8 text-center text-muted">
                  <div className="mb-3 flex gap-1.5">{["bg-rose", "bg-sun", "bg-mint"].map((c) => <span key={c} className={cx("h-3 w-3 rounded-full", c)} />)}</div>
                  Ready to scan
                </div>
              )}
            </div>
          </div>

          <div className="mt-8">
            <button onClick={() => setDemo(!demo)} className="text-sm font-bold text-navy hover:underline">{demo ? "Hide" : "Show"} demo badges (tap to simulate a scan)</button>
            {demo && employees.some((e) => e.qrToken) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {employees.filter((e) => e.active).map((e) => (
                  <button key={e.id} onClick={() => scan(`PLAYROOM-STAFF:${e.qrToken}`)} className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-sm font-bold hover:border-sky">
                    <Avatar name={e.name} size={26} /> {e.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-white p-5">
          <h3 className="font-display text-lg font-medium">Today&apos;s scans</h3>
          <div className="mt-3 space-y-2">
            {recent.map((r) => {
              const e = employees.find((x) => x.id === r.emp);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl bg-[#faf7f1] px-3 py-2">
                  <Avatar name={e?.name ?? "?"} size={30} />
                  <div className="flex-1 text-sm font-bold">{e?.name}</div>
                  <span className={cx("flex items-center gap-1 text-xs font-bold", r.dir === "in" ? "text-[#2f8f72]" : "text-navy")}>
                    {r.dir === "in" ? <LogIn size={13} /> : <LogOut size={13} />} {fmtTime(r.at)}
                  </span>
                </div>
              );
            })}
            {recent.length === 0 && <p className="text-sm text-muted">No scans yet today.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
