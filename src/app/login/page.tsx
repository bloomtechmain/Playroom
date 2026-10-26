"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBoot, useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/Shell";

export default function LoginPage() {
  const mounted = useHydrated();
  const ready = useBoot("login");
  if (!mounted || !ready) return null;
  return <Login />;
}

function Login() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await login(username, password);
    setBusy(false);
    if (err) return setError(err);
    router.replace("/dashboard");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#fffdf9] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Blobs />
        <div className="relative">
          <Logo className="w-[340px]" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold text-navy">Everything for the playroom, in one place.</h2>
          <p className="mt-3 text-muted">
            Check kids in, keep an eye on capacity, run birthday parties, sell snacks and socks, pay the team and see how the month is
            going — all from the front desk.
          </p>
        </div>
        <p className="relative text-xs text-muted">© {new Date().getFullYear()} The Playroom · Colombo</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo className="mx-auto w-[220px]" />
          </div>
          {mode === "login" && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold text-navy">Good to see you</h1>
                <p className="text-sm text-muted">Sign in with your staff account.</p>
              </div>
              <Field label="Username">
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="e.g. cashier" />
              </Field>
              <Field label="Password">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
              </Field>
              {error && <p className="rounded-xl bg-rose-soft px-3 py-2 text-sm font-semibold text-[#b5435e]">{error}</p>}
              <Button className="w-full" size="lg" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <button type="button" onClick={() => { setMode("forgot"); setError(""); }} className="w-full text-center text-sm font-bold text-navy hover:underline">
                Forgot password?
              </button>

            </form>
          )}

          {mode === "forgot" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold text-navy">Forgot your password?</h1>
                <p className="mt-1 text-sm text-muted">Ask an administrator or the owner to reset it in <b>Users &amp; Roles</b>. They&apos;ll give you a temporary password, and you&apos;ll choose a new one when you sign in.</p>
              </div>
              <Button className="w-full" onClick={() => setMode("login")}>Back to sign in</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Blobs() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <circle cx="540" cy="120" r="90" fill="#fdedf1" />
      <circle cx="80" cy="560" r="120" fill="#eaf3fc" />
      <circle cx="470" cy="640" r="70" fill="#fff5d8" />
      <circle cx="300" cy="420" r="40" fill="#e5f6f0" />
      <rect x="430" y="300" width="80" height="80" rx="24" fill="#f2edfa" transform="rotate(14 470 340)" />
    </svg>
  );
}
