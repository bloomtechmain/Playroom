"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, Pencil, Plus, Printer, QrCode, RefreshCw } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { Employee, Role, User } from "@/lib/types";
import { cx, fmtDate, fmtTime, money, suggestUsername, today, uid } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Select, Stat, Table, Toggle, toast } from "@/components/ui";
import { Avatar, Logo } from "@/components/Shell";
import { PayItemsEditor } from "@/components/PayItems";
import { cleanItems } from "@/lib/payroll";

export default function StaffPage() {
  const can = useCan();
  if (!can("hr.view")) return <NoAccess what="staff records" />;
  return <Inner />;
}

interface LoginForm {
  on: boolean;
  username: string;
  /** stop suggesting a username once it has been typed by hand */
  typed: boolean;
  roleId: string;
  email: string;
}

const allowanceTotal = (e: Employee) => (e.allowances ?? []).reduce((a, x) => a + x.amount, 0);
const newLogin = (on: boolean): LoginForm => ({ on, username: "", typed: false, roleId: "", email: "" });
const loginReady = (l: LoginForm) => !l.on || (!!l.username && !!l.roleId);

function Inner() {
  const can = useCan();
  const employees = useStore((s) => s.employees);
  const attendance = useStore((s) => s.attendance);
  const users = useStore((s) => s.users);
  const roles = useStore((s) => s.roles);
  const save = useStore((s) => s.save);
  const saveStaff = useStore((s) => s.saveStaff);
  const [edit, setEdit] = useState<Employee | null>(null);
  const [login, setLogin] = useState<LoginForm>(newLogin(false));
  const [loginFor, setLoginFor] = useState<Employee | null>(null);
  const [issued, setIssued] = useState<{ name: string; username: string; pw: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [badge, setBadge] = useState<Employee | null>(null);
  const canLogin = can("users.edit");
  const d = today();
  const todayAtt = attendance.filter((a) => a.date === d);
  const inNow = todayAtt.filter((a) => !a.clockOut).length;
  const payrollCost = employees.filter((e) => e.active).reduce((a, e) => a + e.basic + allowanceTotal(e), 0);
  const loginOf = (e: Employee) => users.find((u) => u.employeeId === e.id);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  const openNew = () => {
    setEdit({ id: "", code: `EMP-${101 + employees.length}`, name: "", designation: "", phone: "", nic: "", joinDate: d, basic: 45000, allowances: [], deductions: [], otRate: 280, epf: true, etf: true, epfNo: "", bank: "", active: true, qrToken: Math.random().toString(36).slice(2, 9).toUpperCase(), color: "sky" });
    setLogin(newLogin(canLogin));
  };
  const setName = (name: string) => {
    setEdit((e) => e && { ...e, name });
    setLogin((l) => (l.typed ? l : { ...l, username: suggestUsername(name, users.map((u) => u.username)) }));
  };
  const done = (r: Awaited<ReturnType<typeof saveStaff>>) => {
    if (r?.tempPassword && r.user) setIssued({ name: r.employee.name, username: r.user.username, pw: r.tempPassword });
    else toast("Saved");
  };

  const submitEmployee = async () => {
    if (!edit) return;
    if (!edit.name.trim()) return toast("Enter the employee's name", "err");
    if (!loginReady(login)) return toast("Choose a username and a role for the login", "err");
    setBusy(true);
    const clean = { ...edit, allowances: cleanItems(edit.allowances ?? []), deductions: cleanItems(edit.deductions ?? []) };
    const r = await saveStaff(edit.id ? clean : { ...clean, id: uid("e") }, !edit.id && login.on ? { username: login.username, roleId: login.roleId, email: login.email } : undefined);
    setBusy(false);
    if (!r) return;
    setEdit(null);
    done(r);
  };
  const submitLogin = async () => {
    if (!loginFor) return;
    if (!loginReady(login)) return toast("Choose a username and a role", "err");
    setBusy(true);
    const r = await saveStaff(loginFor, { username: login.username, roleId: login.roleId, email: login.email });
    setBusy(false);
    if (!r) return;
    setLoginFor(null);
    done(r);
  };

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Team records, salaries, app logins and QR badges for clocking in."
        actions={can("hr.edit") && <Button icon={<Plus size={16} />} onClick={openNew}>Add employee</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active staff" value={employees.filter((e) => e.active).length} tone="sky" />
        <Stat label="On site now" value={inNow} sub={`${todayAtt.length} clocked in today`} tone="mint" />
        <Stat label="Monthly fixed salaries" value={money(payrollCost)} tone="lilac" />
        <Stat label="EPF/ETF registered" value={employees.filter((e) => e.epf).length} sub={`${employees.filter((e) => !e.epf).length} opted out`} tone="sun" />
      </div>
      <Card pad={false}>
        <Table head={["Employee", "Designation", "App login", "Joined", "Basic + allowance", "EPF / ETF", "Today", ""]}>
          {employees.map((e) => {
            const a = todayAtt.find((x) => x.employeeId === e.id);
            const u = loginOf(e);
            return (
              <tr key={e.id} className={cx(!e.active && "opacity-50")}>
                <td>
                  <div className="flex items-center gap-3">
                    <Avatar name={e.name} size={32} />
                    <div>
                      <div className="font-bold">{e.name}</div>
                      <div className="font-mono text-[11px] text-muted">{e.code}{e.phone && ` · ${e.phone}`}</div>
                    </div>
                  </div>
                </td>
                <td>{e.designation}</td>
                <td>
                  {u ? (
                    <div>
                      <div className="font-mono text-xs">{u.username}</div>
                      <Badge tone={u.active ? "sky" : "gray"}>{roleName(u.roleId)}{!u.active && " · off"}</Badge>
                    </div>
                  ) : canLogin && e.active && can("hr.edit") ? (
                    <Button size="sm" variant="soft" icon={<KeyRound size={13} />} onClick={() => { setLoginFor(e); setLogin({ ...newLogin(true), username: suggestUsername(e.name, users.map((x) => x.username)) }); }}>Create login</Button>
                  ) : (
                    <span className="text-xs text-muted">No login</span>
                  )}
                </td>
                <td className="tabular text-muted">{fmtDate(e.joinDate)}</td>
                <td className="tabular">{money(e.basic + allowanceTotal(e))}{(e.allowances?.length ?? 0) > 0 && <div className="text-[11px] text-muted">{e.allowances.length} allowance{e.allowances.length > 1 && "s"}</div>}</td>
                <td className="text-xs">{e.epf ? <Badge tone="mint">EPF {e.etf && "+ ETF"}</Badge> : <Badge tone="gray">Not enrolled</Badge>}</td>
                <td>{!e.active ? <Badge tone="gray">Inactive</Badge> : a ? (a.clockOut ? <Badge tone="sky">Left {fmtTime(a.clockOut)}</Badge> : <Badge tone="mint">In since {fmtTime(a.clockIn)}</Badge>) : <Badge tone="gray">Not in</Badge>}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button title="QR badge" onClick={() => setBadge(e)} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><QrCode size={15} /></button>
                    {can("hr.edit") && <button title="Edit" onClick={() => { setEdit(e); setLogin(newLogin(false)); }} className="rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy"><Pencil size={15} /></button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : "New employee"} width="max-w-2xl" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={busy} onClick={submitEmployee}>{!edit.id && login.on ? "Save & create login" : "Save"}</Button></>}>
          <Section n={1} title="Details">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Full name" className="sm:col-span-2"><Input autoFocus value={edit.name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Employee code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
              <Field label="Designation"><Input value={edit.designation} placeholder="e.g. Cashier" onChange={(e) => setEdit({ ...edit, designation: e.target.value })} /></Field>
              <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="NIC"><Input value={edit.nic} onChange={(e) => setEdit({ ...edit, nic: e.target.value })} /></Field>
              <Field label="Join date"><Input type="date" value={edit.joinDate} onChange={(e) => setEdit({ ...edit, joinDate: e.target.value })} /></Field>
              <div className="flex items-end pb-2 sm:col-span-2"><Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label={edit.id && loginOf(edit) ? "Active (badge and login work)" : "Active (badge works)"} /></div>
            </div>
          </Section>
          <Section n={2} title="Pay & EPF">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Basic salary (Rs.)"><Input type="number" value={edit.basic} onChange={(e) => setEdit({ ...edit, basic: Number(e.target.value) })} /></Field>
              <Field label="OT rate / hour (Rs.)"><Input type="number" value={edit.otRate} onChange={(e) => setEdit({ ...edit, otRate: Number(e.target.value) })} /></Field>
              <Field label="EPF number"><Input value={edit.epfNo} onChange={(e) => setEdit({ ...edit, epfNo: e.target.value })} /></Field>
              <Field label="Bank & account" className="sm:col-span-2"><Input value={edit.bank} onChange={(e) => setEdit({ ...edit, bank: e.target.value })} /></Field>
              <div className="flex flex-wrap gap-6 sm:col-span-3">
                <Toggle checked={edit.epf} onChange={(v) => setEdit({ ...edit, epf: v })} label="Contribute EPF" />
                <Toggle checked={edit.etf} onChange={(v) => setEdit({ ...edit, etf: v })} label="Contribute ETF" />
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1 text-[13px] font-bold text-ink/80">Monthly allowances</div>
              <p className="mb-2 text-xs text-muted">Paid every month. Tick EPF/ETF for allowances that count towards EPF and ETF (e.g. cost of living); leave it off for travelling and similar.</p>
              <PayItemsEditor kind="allowance" items={edit.allowances ?? []} onChange={(allowances) => setEdit({ ...edit, allowances })} />
            </div>
            <div className="mt-5">
              <div className="mb-1 text-[13px] font-bold text-ink/80">Recurring monthly deductions</div>
              <p className="mb-2 text-xs text-muted">Taken from pay every month, e.g. a loan instalment or welfare fund. One-off deductions (advances, no-pay) are added on the month&apos;s payroll.</p>
              <PayItemsEditor kind="deduction" items={edit.deductions ?? []} onChange={(deductions) => setEdit({ ...edit, deductions })} />
            </div>
          </Section>
          <Section n={3} title="App login" last>
            {edit.id ? (
              loginOf(edit) ? (
                <p className="text-sm text-muted">Signs in as <b className="font-mono text-ink">{loginOf(edit)!.username}</b> · {roleName(loginOf(edit)!.roleId)}. Change the role or reset the password in <Link href="/users" className="font-bold text-navy hover:underline">Users &amp; Roles</Link>.</p>
              ) : (
                <p className="text-sm text-muted">No login yet — use <b>Create login</b> in the staff list.</p>
              )
            ) : !canLogin ? (
              <p className="text-sm text-muted">Ask an administrator to create a login for this employee.</p>
            ) : (
              <>
                <Toggle checked={login.on} onChange={(v) => setLogin({ ...login, on: v })} label="Give this employee a login to the app" />
                {login.on && <LoginFields login={login} setLogin={setLogin} roles={roles} users={users} />}
              </>
            )}
          </Section>
        </Modal>
      )}

      {loginFor && (
        <Modal open onClose={() => setLoginFor(null)} title={`App login for ${loginFor.name}`} footer={<><Button variant="secondary" onClick={() => setLoginFor(null)}>Cancel</Button><Button disabled={busy} onClick={submitLogin}>Create login</Button></>}>
          <LoginFields login={login} setLogin={setLogin} roles={roles} users={users} />
        </Modal>
      )}

      {issued && (
        <Modal open onClose={() => setIssued(null)} title="Login created" footer={<Button onClick={() => setIssued(null)}>Done</Button>}>
          <p className="text-sm">Give these details to <b>{issued.name}</b>. They&apos;ll choose their own password the first time they sign in.</p>
          <div className="mt-3 space-y-2 rounded-xl bg-sun-soft px-4 py-3">
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">Username</span><span className="font-mono text-lg font-bold">{issued.username}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">One-time password</span><span className="font-mono text-lg font-bold tracking-wider">{issued.pw}</span></div>
          </div>
          <p className="mt-2 text-xs text-muted">This password is shown only once. If it&apos;s lost, reset it in Users &amp; Roles.</p>
        </Modal>
      )}

      {badge && (
        <Modal open onClose={() => setBadge(null)} title="Staff QR badge" width="max-w-sm" footer={<>
          {can("hr.edit") && <Button variant="ghost" className="mr-auto" icon={<RefreshCw size={14} />} onClick={() => { const nb = { ...badge, qrToken: Math.random().toString(36).slice(2, 9).toUpperCase() }; save("employees", nb, "HR", `Re-issued QR badge for ${badge.name} (old badge revoked)`); setBadge(nb); toast("New badge issued — old one no longer works"); }}>Re-issue</Button>}
          <Button icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
        </>}>
          <div className="print-area mx-auto w-[240px] overflow-hidden rounded-2xl border border-line bg-white text-center">
            <div className="flex h-3">{["bg-navy", "bg-sky", "bg-lilac", "bg-mint", "bg-rose", "bg-sun", "bg-teal"].map((c) => <span key={c} className={cx("flex-1", c)} />)}</div>
            <div className="p-4">
              <Logo className="mx-auto w-[120px]" />
              <div className="mt-3 font-display text-lg font-semibold">{badge.name}</div>
              <div className="text-xs text-muted">{badge.designation}</div>
              <div className="my-3 flex justify-center"><QRCodeSVG value={`PLAYROOM-STAFF:${badge.qrToken}`} size={140} fgColor="#24395f" /></div>
              <div className="font-mono text-xs text-muted">{badge.code}</div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Scan at the <a className="font-bold text-navy" href="/kiosk" target="_blank">clock-in kiosk</a> to clock in and out.</p>
        </Modal>
      )}
    </>
  );
}

function Section({ n, title, last, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={cx("pb-5", !last && "mb-5 border-b border-line")}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-navy text-[11px] text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Username, role and email for a new login. Roles other than the owner; the role decides what they can see and do. */
function LoginFields({ login, setLogin, roles, users }: { login: LoginForm; setLogin: (l: LoginForm) => void; roles: Role[]; users: User[] }) {
  const username = login.username.trim().toLowerCase();
  const taken = !!username && users.some((u) => u.username.toLowerCase() === username);
  const role = roles.find((r) => r.id === login.roleId);
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <Field label="Username" hint={taken ? <span className="text-[#c24f69]">Already taken</span> : "They sign in with this"}>
        <Input value={login.username} onChange={(e) => setLogin({ ...login, typed: true, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
      </Field>
      <Field label="Role">
        <Select value={login.roleId} onChange={(e) => setLogin({ ...login, roleId: e.target.value })}>
          <option value="">Choose a role…</option>
          {roles.filter((r) => r.id !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      {role && <p className="-mt-2 text-xs text-muted sm:col-span-2">{role.description}</p>}
      <Field label="Email (optional)" className="sm:col-span-2"><Input type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></Field>
      <p className="text-xs text-muted sm:col-span-2">A one-time password is created when you save. They choose their own password at first sign-in.</p>
    </div>
  );
}
