"use client";

import { useState } from "react";
import { useStore, useMe } from "@/lib/store";
import { fmtDT } from "@/lib/utils";
import { localDay } from "@/lib/accounting";
import { Badge, Button, Card, Field, Input, PageHeader, toast } from "@/components/ui";
import { Avatar } from "@/components/Shell";

export default function ProfilePage() {
  const me = useMe()!;
  const roles = useStore((s) => s.roles);
  const save = useStore((s) => s.save);
  const changePassword = useStore((s) => s.changePassword);
  const activity = useStore((s) => s.activity);
  const [f, setF] = useState({ name: me.name, email: me.email, phone: me.phone });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const strong = pw.next.length >= 8 && /\d/.test(pw.next) && /[A-Za-z]/.test(pw.next);
  const mine = activity.filter((a) => a.userId === me.id).slice(0, 12);

  const changePw = async () => {
    if (!pw.current) return toast("Current password is incorrect", "err");
    if (!strong) return toast("Use 8+ characters with letters and numbers", "err");
    if (pw.next !== pw.confirm) return toast("New passwords don't match", "err");
    if (pw.next === pw.current) return toast("Choose a different password", "err");
    const err = await changePassword(pw.current, pw.next);
    if (err) return toast(err, "err");
    setPw({ current: "", next: "", confirm: "" });
    toast("Password updated");
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Your details and sign-in security." />
      {me.mustChangePassword && <div className="mb-5 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm font-bold text-[#8a6510]">You&apos;re using a temporary password. Please set a new one below.</div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
        <Card title="Profile">
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={me.name} size={56} />
            <div>
              <div className="font-display text-xl font-medium">{me.name}</div>
              <Badge tone="lilac">{roles.find((r) => r.id === me.roleId)?.name}</Badge>
            </div>
          </div>
          <div className="space-y-4">
            <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Username"><Input value={me.username} disabled /></Field>
            <Button onClick={async () => { if (await save("users", { ...me, ...f }, "Users", `${me.name} updated own profile`)) toast("Profile updated"); }}>Save profile</Button>
          </div>
        </Card>
        <Card title="Change password">
          <div className="space-y-4">
            <Field label="Current password"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password" hint={<span className={strong ? "text-[#2f8f72]" : ""}>{pw.next ? (strong ? "Strong enough ✓" : "8+ characters with letters and numbers") : "8+ characters with letters and numbers"}</span>}>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="Confirm new password"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <Button onClick={changePw}>Update password</Button>
          </div>
        </Card>
        <Card title="My recent activity" pad={false}>
          {mine.map((a) => (
            <div key={a.id} className="border-b border-[#f2eee6] px-5 py-2.5 text-sm last:border-0">
              <div className="font-bold">{a.action} <span className="font-normal text-muted">· {a.module}</span></div>
              <div className="text-xs text-muted">{localDay(a.at) === localDay(new Date().toISOString()) ? "Today" : ""} {fmtDT(a.at)} {a.detail && `— ${a.detail}`}</div>
            </div>
          ))}
          {mine.length === 0 && <p className="p-5 text-sm text-muted">Nothing yet.</p>}
          <div className="px-5 py-3 text-xs text-muted">Last sign-in: {me.lastLogin ? fmtDT(me.lastLogin) : "—"}</div>
        </Card>
      </div>
    </>
  );
}
