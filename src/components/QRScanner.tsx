"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "./ui";

/** Camera QR scanner. Hand-held USB scanners also work: they "type" the code into the text box next to it. */
export default function QRScanner({ onScan, height = 260 }: { onScan: (text: string) => void; height?: number }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const id = `qr${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const last = useRef({ text: "", at: 0 });
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!on) return;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelled = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(id);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 190, height: 190 } },
          (text) => {
            const now = Date.now();
            if (text === last.current.text && now - last.current.at < 3000) return;
            last.current = { text, at: now };
            cb.current(text);
          },
          () => {},
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Camera not available");
        setOn(false);
      }
    })();
    return () => {
      cancelled = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [on, id]);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[#d6cdbd] bg-[#f7f4ee]"
        style={{ height }}
      >
        <div id={id} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
        {!on && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="relative mx-auto mb-3 h-20 w-20">
                {["left-0 top-0 border-l-4 border-t-4 rounded-tl-xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl"].map((c) => (
                  <span key={c} className={`absolute h-6 w-6 border-navy ${c}`} />
                ))}
              </div>
              <Button size="sm" icon={<Camera size={15} />} onClick={() => { setErr(""); setOn(true); }}>
                Start camera
              </Button>
              {err && <p className="mt-2 px-4 text-xs text-[#c24f69]">{err}</p>}
            </div>
          </div>
        )}
      </div>
      {on && (
        <button onClick={() => setOn(false)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink">
          <CameraOff size={14} /> Stop camera
        </button>
      )}
    </div>
  );
}
