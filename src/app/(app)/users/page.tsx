"use client";

import { useState } from "react";
import { KeyRound, Lock, Pencil, Plus, RefreshCw } from "lucide-react";
import { useStore, useCan, useMe } from "@/lib/store";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import type { Role, User } from "@/lib/types";
import { cx, fmtDT, suggestUsername, tempPassword, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Table, Tabs, Textarea, Toggle, toast } from "@/components/ui";
import { Avatar } from "@/components/Shell";

const NOT_STAFF = "__not_staff";
const strongPw = (pw: string) => pw.length >= 8 && /\d/.test(pw) && /[A-Za-z]/.test(pw);

export default function UsersPage() {
  const can = useCan();
  if (!can("users.view")) return <NoAccess what="user management" />;
  return <Inner />;
}

function Inner() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Staff logins, what each role can do, and who can approve what." />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} items={[{ value: "users", label: "User accounts" }, { value: "roles", label: "Roles & permissions" }]} /></div>
      {tab === "users" ? <Users /> : <Roles />}
    </>
  );
}

function Users() {
  const can = useCan();
  const me = useMe();
  const users = useStore((s) => s.users);
  const roles = useStore((s) => s.roles);
  const employees = useStore((s) => s.employees);
  const save = useStore((s) => s.save);
  const [edit, setEdit] = useState<User | null>(null);
  const [staffId, setStaffId] = useState("");
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ name: string; username?: string; pw: string } | null>(null);
  // staff members who don't have a login yet
  const freeStaff = employees.filter((e) => e.active && !users.some((u) => u.employeeId === e.id));
  const taken = !!edit?.username && users.some((u) => u.username.toLowerCase() === edit.username.toLowerCase() && u.id !== edit.id);

  const openNew = () => {
    setEdit({ id: "", name: "", username: "", email: "", phone: "", roleId: "", active: true, password: tempPassword(), createdAt: new Date().toISOString() });
    setStaffId("");
    setTyped(false);
  };
  const pickStaff = (id: string) => {
    setStaffId(id);
    if (!edit) return;
    const e = employees.find((x) => x.id === id);
    const next = e ? { ...edit, name: e.name, phone: e.phone, employeeId: e.id } : { ...edit, name: "", phone: "", employeeId: undefined };
    setEdit(typed ? next : { ...next, username: e ? suggestUsername(e.name, users.map((u) => u.username)) : "" });
  };
  const saveNew = async () => {
    if (!edit) return;
    if (!staffId) return toast("Choose a staff member", "err");
    if (!edit.name.trim()) return toast("Enter their full name", "err");
    if (!edit.username) return toast("Enter a username", "err");
    if (taken) return toast("Username already taken", "err");
    if (!strongPw(edit.password ?? "")) return toast("Use a password of 8+ characters with letters and numbers", "err");
    if (!edit.roleId) return toast("Choose a role", "err");
    const item: User = { ...edit, id: uid("u"), mustChangePassword: true, employeeId: staffId === NOT_STAFF ? undefined : staffId };
    setBusy(true);
    const ok = await save("users", item, "Users", `Created login ${item.username} for ${item.name}`);
    setBusy(false);
    if (!ok) return;
    setEdit(null);
    setTemp({ name: item.name, username: item.username, pw: item.password! });
  };

  const toggle = (u: User) => {
    if (u.id === me?.id) return toast("You can't deactivate your own account", "err");
    if (u.roleId === "owner") return toast("The owner account can't be deactivated", "err");
    save("users", { ...u, active: !u.active }, "Users", `${u.active ? "Deactivated" : "Activated"} ${u.name}`);
    toast(`${u.name} ${u.active ? "deactivated" : "activated"}`);
  };
  const reset = (u: User) => {
    const pw = tempPassword();
    save("users", { ...u, password: pw, mustChangePassword: true }, "Users", `Password reset for ${u.name} (temporary password issued)`);
    setTemp({ name: u.name, pw });
  };

  return (
    <>
      <Card pad={false} title={`${users.length} accounts`} action={can("users.edit") && <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>New user</Button>}>
        <Table head={["User", "Username", "Role", "Status", "Last sign-in", ""]}>
          {users.map((u) => (
            <tr key={u.id} className={cx(!u.active && "opacity-60")}>
              <td>
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size={32} />
                  <div><div className="font-bold">{u.name}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}</div><div className="text-xs text-muted">{[employees.find((e) => e.id === u.employeeId)?.code && `Staff ${employees.find((e) => e.id === u.employeeId)!.code}`, u.email].filter(Boolean).join(" · ")}</div></div>
                </div>
              </td>
              <td className="font-mono text-xs">{u.username}</td>
              <td><Badge tone={u.roleId === "owner" ? "navy" : u.roleId === "admin" ? "lilac" : u.roleId === "manager" ? "teal" : "gray"}>{roles.find((r) => r.id === u.roleId)?.name}</Badge></td>
              <td>{u.active ? <Badge tone="mint">Active</Badge> : <Badge tone="rose">Deactivated</Badge>}{u.mustChangePassword && <Badge tone="sun" className="ml-1">Temp password</Badge>}</td>
              <td className="tabular text-muted">{u.lastLogin ? fmtDT(u.lastLogin) : "Never"}</td>
              <td>
                {can("users.edit") && (
                  <div className="flex items-center justify-end gap-2">
                    <Toggle checked={u.active} onChange={() => toggle(u)} />
                    <button title="Reset password" onClick={() => reset(u)} className="rounded-lg p-1.5 text-muted hover:bg-sun-soft hover:text-[#a37812]"><KeyRound size={15} /></button>
                    <button title="Edit" onClick={() => setEdit(u)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={15} /></button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {edit && !edit.id && (
        <Modal open onClose={() => setEdit(null)} title="New login" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={busy} onClick={saveNew}>Create login</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Staff member" className="sm:col-span-2" hint={!freeStaff.length && staffId !== NOT_STAFF ? "Everyone on the staff list already has a login — add the person in Staff first" : undefined}>
              <Select value={staffId} onChange={(e) => pickStaff(e.target.value)}>
                <option value="">Choose a staff member…</option>
                {freeStaff.map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation && ` — ${e.designation}`}</option>)}
                <option value={NOT_STAFF}>Not on the staff list (e.g. outside accountant)</option>
              </Select>
            </Field>
            {staffId === NOT_STAFF && (
              <>
                <Field label="Full name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onBlur={() => !typed && setEdit((x) => x && { ...x, username: suggestUsername(x.name, users.map((u) => u.username)) })} /></Field>
                <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              </>
            )}
            {staffId && (
              <>
                <Field label="Username" hint={taken ? <span className="text-[#c24f69]">Already taken</span> : "They sign in with this"}>
                  <Input value={edit.username} onChange={(e) => { setTyped(true); setEdit({ ...edit, username: e.target.value.toLowerCase().replace(/\s/g, "") }); }} />
                </Field>
                <Field label="Password" hint={<span className={strongPw(edit.password ?? "") ? "text-[#2f8f72]" : ""}>{strongPw(edit.password ?? "") ? "Strong enough ✓" : "8+ characters, letters and numbers"}</span>}>
                  <div className="flex gap-2">
                    <Input className="font-mono" value={edit.password ?? ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
                    <Button type="button" variant="secondary" size="sm" title="Make a new random password" icon={<RefreshCw size={14} />} onClick={() => setEdit({ ...edit, password: tempPassword() })} />
                  </div>
                </Field>
                <Field label="Role" className="sm:col-span-2" hint={roles.find((r) => r.id === edit.roleId)?.description}>
                  <Select value={edit.roleId} onChange={(e) => setEdit({ ...edit, roleId: e.target.value })}>
                    <option value="">Choose a role…</option>
                    {roles.filter((r) => r.id !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </Field>
                <Field label="Email (optional)" className="sm:col-span-2"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
                <p className="text-xs text-muted sm:col-span-2">Give them the username and password. They&apos;ll be asked to choose their own password the first time they sign in.</p>
              </>
            )}
          </div>
        </Modal>
      )}
      {edit && edit.id && (
        <Modal open onClose={() => setEdit(null)} title={`Edit ${edit.name}`} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => {
          if (!edit.name || !edit.username) return toast("Name and username are required", "err");
          if (users.some((u) => u.username === edit.username && u.id !== edit.id)) return toast("Username already taken", "err");
          save("users", edit, "Users", `Edited user ${edit.name}`);
          toast("User saved");
          setEdit(null);
        }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Username"><Input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase().replace(/\s/g, "") })} /></Field>
            <Field label="Email"><Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Role" className="sm:col-span-2">
              <Select value={edit.roleId} disabled={edit.roleId === "owner"} onChange={(e) => setEdit({ ...edit, roleId: e.target.value })}>
                {roles.filter((r) => r.id !== "owner" || edit.roleId === "owner").map((r) => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}
              </Select>
            </Field>
          </div>
        </Modal>
      )}
      <Modal open={!!temp} onClose={() => setTemp(null)} title={temp?.username ? "Login created" : "Temporary password issued"} footer={<Button onClick={() => setTemp(null)}>Done</Button>}>
        <p className="text-sm">Give {temp?.username ? "these details" : "this one-time password"} to <b>{temp?.name}</b>. They&apos;ll be asked to choose a new password at next sign-in.</p>
        <div className="mt-3 space-y-2 rounded-xl bg-sun-soft px-4 py-3">
          {temp?.username && <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">Username</span><span className="font-mono text-lg font-bold">{temp.username}</span></div>}
          <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">Password</span><span className="font-mono text-lg font-bold tracking-wider">{temp?.pw}</span></div>
        </div>
      </Modal>
    </>
  );
}

function Roles() {
  const can = useCan();
  const roles = useStore((s) => s.roles);
  const users = useStore((s) => s.users);
  const save = useStore((s) => s.save);
  const [sel, setSel] = useState(roles[1]?.id ?? roles[0].id);
  const [adding, setAdding] = useState<Role | null>(null);
  const role = roles.find((r) => r.id === sel)!;
  const editable = can("roles.edit") && !role.locked;

  const togglePerm = (key: string) => {
    const has = role.permissions.includes(key);
    save("roles", { ...role, permissions: has ? role.permissions.filter((p) => p !== key) : [...role.permissions, key] }, "Roles", `${role.name}: ${has ? "removed" : "granted"} ${key}`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <Card pad={false} title="Roles" action={can("roles.edit") && <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setAdding({ id: "", name: "", description: "", permissions: [] })}>New</Button>}>
        {roles.map((r) => (
          <button key={r.id} onClick={() => setSel(r.id)} className={cx("flex w-full items-center justify-between border-b border-[#f2eee6] px-5 py-3 text-left last:border-0", sel === r.id ? "bg-sky-soft" : "hover:bg-[#fcfaf5]")}>
            <div>
              <div className="flex items-center gap-1.5 font-bold">{r.name}{r.locked && <Lock size={12} className="text-muted" />}</div>
              <div className="text-xs text-muted">{r.description}</div>
            </div>
            <span className="text-xs text-muted">{users.filter((u) => u.roleId === r.id).length} users</span>
          </button>
        ))}
      </Card>
      <Card title={<span>{role.name} <span className="ml-2 text-sm font-normal text-muted">{role.locked ? "All permissions · locked" : `${role.permissions.length} permissions`}</span></span>}>
        <div className="grid gap-5 md:grid-cols-2">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.module} className="rounded-xl border border-line p-4">
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">{g.module}</div>
              {g.items.map((i) => {
                const on = role.locked || role.permissions.includes(i.key);
                return (
                  <label key={i.key} className={cx("flex items-center justify-between gap-3 py-1.5 text-sm", !editable && "opacity-80")}>
                    <span>{i.label}</span>
                    <Toggle checked={on} disabled={!editable} onChange={() => togglePerm(i.key)} />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        {!can("roles.edit") && <p className="mt-4 text-xs text-muted">You can view roles but not change them.</p>}
      </Card>
      {adding && (
        <Modal open onClose={() => setAdding(null)} title="New role" footer={<><Button variant="secondary" onClick={() => setAdding(null)}>Cancel</Button><Button onClick={() => { if (!adding.name) return; const r = { ...adding, id: uid("role-") }; save("roles", r, "Roles", `Created role ${r.name}`); setSel(r.id); setAdding(null); }}>Create</Button></>}>
          <div className="space-y-4">
            <Field label="Role name"><Input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="e.g. Weekend Supervisor" /></Field>
            <Field label="Description"><Textarea value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} /></Field>
            <Field label="Copy permissions from">
              <Select onChange={(e) => setAdding({ ...adding, permissions: [...(roles.find((r) => r.id === e.target.value)?.permissions ?? [])] })}>
                <option value="">Start empty</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
