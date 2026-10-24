"use client";

import { useState } from "react";
import { KeyRound, Lock, Pencil, Plus } from "lucide-react";
import { useStore, useCan, useMe } from "@/lib/store";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import type { Role, User } from "@/lib/types";
import { cx, fmtDT, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Table, Tabs, Textarea, Toggle, toast } from "@/components/ui";
import { Avatar } from "@/components/Shell";

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
  const save = useStore((s) => s.save);
  const [edit, setEdit] = useState<User | null>(null);
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null);

  const toggle = (u: User) => {
    if (u.id === me?.id) return toast("You can't deactivate your own account", "err");
    if (u.roleId === "owner") return toast("The owner account can't be deactivated", "err");
    save("users", { ...u, active: !u.active }, "Users", `${u.active ? "Deactivated" : "Activated"} ${u.name}`);
    toast(`${u.name} ${u.active ? "deactivated" : "activated"}`);
  };
  const reset = (u: User) => {
    const pw = `Play${Math.floor(1000 + Math.random() * 9000)}`;
    save("users", { ...u, password: pw, mustChangePassword: true }, "Users", `Password reset for ${u.name} (temporary password issued)`);
    setTemp({ name: u.name, pw });
  };

  return (
    <>
      <Card pad={false} title={`${users.length} accounts`} action={can("users.edit") && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ id: "", name: "", username: "", email: "", phone: "", roleId: "cashier", active: true, password: "demo123", createdAt: new Date().toISOString() })}>New user</Button>}>
        <Table head={["User", "Username", "Role", "Status", "Last sign-in", ""]}>
          {users.map((u) => (
            <tr key={u.id} className={cx(!u.active && "opacity-60")}>
              <td>
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size={32} />
                  <div><div className="font-bold">{u.name}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}</div><div className="text-xs text-muted">{u.email}</div></div>
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
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : "New user"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => {
          if (!edit.name || !edit.username) return toast("Name and username are required", "err");
          if (users.some((u) => u.username === edit.username && u.id !== edit.id)) return toast("Username already taken", "err");
          const item = edit.id ? edit : { ...edit, id: uid("u"), mustChangePassword: true };
          save("users", item, "Users", `${edit.id ? "Edited" : "Created"} user ${item.name}`);
          toast("User saved");
          setEdit(null);
        }}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Username"><Input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase().replace(/\s/g, "") })} /></Field>
            <Field label="Email"><Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Role" className="sm:col-span-2">
              <Select value={edit.roleId} disabled={edit.roleId === "owner" && !!edit.id} onChange={(e) => setEdit({ ...edit, roleId: e.target.value })}>
                {roles.filter((r) => r.id !== "owner" || edit.roleId === "owner").map((r) => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}
              </Select>
            </Field>
          </div>
          {!edit.id && <p className="mt-3 text-xs text-muted">The new user signs in with the temporary password <b>demo123</b> and is asked to change it.</p>}
        </Modal>
      )}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Temporary password issued">
        <p className="text-sm">Give this one-time password to <b>{temp?.name}</b>. They&apos;ll be asked to choose a new one at next sign-in.</p>
        <div className="mt-3 rounded-xl bg-sun-soft px-4 py-3 text-center font-mono text-2xl font-bold tracking-widest">{temp?.pw}</div>
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
