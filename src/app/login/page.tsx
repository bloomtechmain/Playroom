"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBoot, useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/Shell";
import { cx } from "@/lib/utils";

export default function LoginPage() {
  const mounted = useHydrated();
  const ready = useBoot("login");
  if (!mounted || !ready) return null;
  return <Login />;
}

function Login() {
  const router = useRouter();
  const users = useStore((s) => s.users);
  const roles = useStore((s) => s.roles);
  const login = useStore((s) => s.login);
  const requestReset = useStore((s) => s.requestPasswordReset);
  const resetPassword = useStore((s) => s.resetPassword);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "reset" | "done">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [newPw, setNewPw] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await login(username, password);
    setBusy(false);
    if (err) return setError(err);
    router.replace("/dashboard");
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await requestReset(username);
    if (r.error) return setError(r.error);
    setSentCode(r.code ?? "");
    setError("");
    setMode("reset");
  };

  const strong = newPw.length >= 8 && /\d/.test(newPw) && /[A-Za-z]/.test(newPw);
  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong) return setError("Use at least 8 characters with letters and numbers");
    const err = await resetPassword(username, code, newPw);
    if (err) return setError(err);
    setError("");
    setPassword("");
    setMode("done");
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

              {users.length > 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9d0bf] bg-white p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Demo accounts · password demo123</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {users.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => { setUsername(u.username); setPassword("demo123"); setError(""); }}
                      className={cx("rounded-xl border border-line px-2.5 py-1.5 text-left text-xs hover:border-sky hover:bg-sky-soft", !u.active && "opacity-50")}
                    >
                      <div className="font-bold">{roles.find((r) => r.id === u.roleId)?.name}</div>
                      <div className="text-muted">{u.username}{!u.active && " · inactive"}</div>
                    </button>
                  ))}
                </div>
              </div>}
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={sendReset} className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold text-navy">Reset your password</h1>
                <p className="text-sm text-muted">We&apos;ll send a one-time code to the email on your account.</p>
              </div>
              <Field label="Username or email">
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
              </Field>
              {error && <p className="rounded-xl bg-rose-soft px-3 py-2 text-sm font-semibold text-[#b5435e]">{error}</p>}
              <Button className="w-full" size="lg">Send code</Button>
              <button type="button" onClick={() => setMode("login")} className="w-full text-sm font-bold text-muted">Back to sign in</button>
            </form>
          )}

          {mode === "reset" && (
            <form onSubmit={doReset} className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold text-navy">Check your inbox</h1>
                <p className="text-sm text-muted">Enter the 6-digit code and choose a new password. The code expires in 15 minutes.</p>
              </div>
              {sentCode && (
                <div className="rounded-xl bg-sun-soft px-3 py-2 text-sm text-[#8a6510]">
                  Demo only — the emailed code is <b className="tabular">{sentCode}</b>
                </div>
              )}
              <Field label="Code">
                <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} />
              </Field>
              <Field label="New password" hint={<span className={strong ? "text-[#2f8f72]" : ""}>{strong ? "Strong enough ✓" : "8+ characters, letters and numbers"}</span>}>
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </Field>
              {error && <p className="rounded-xl bg-rose-soft px-3 py-2 text-sm font-semibold text-[#b5435e]">{error}</p>}
              <Button className="w-full" size="lg">Update password</Button>
            </form>
          )}

          {mode === "done" && (
            <div className="space-y-4 text-center">
              <h1 className="text-2xl font-semibold text-navy">Password updated</h1>
              <p className="text-sm text-muted">You can now sign in with your new password.</p>
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
