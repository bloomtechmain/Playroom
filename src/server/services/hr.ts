import "server-only";
import type { Employee, User } from "@/lib/types";
import { arrivalOf } from "@/lib/punctuality";
import { fmtTime, tempPassword, today, uid } from "@/lib/utils";
import { toItem } from "../collections";
import { badRequest, HttpError } from "../http";
import type { Mut } from "../mutation";
import { saveRecord } from "./records";

export type ClockResult = { ok: boolean; message: string; name?: string; direction?: "in" | "out" };

/**
 * Badge scan at the QR reader ("Staff attendance"). `direction` is what the staff member chose (Clock in /
 * Clock out); without it the first scan of the day clocks in and the next one clocks out.
 */
export async function clockByToken(m: Mut, token: string, direction?: "in" | "out"): Promise<ClockResult> {
  const raw = token.trim();
  const qr = raw.startsWith("PLAYROOM-STAFF:") ? raw.slice("PLAYROOM-STAFF:".length) : "";
  if (!qr) return { ok: false, message: "Badge not recognised" };
  const [e] = await m.rows("employees", "SELECT * FROM employees WHERE qr_token = $1", [qr]);
  if (!e) return { ok: false, message: "Badge not recognised" };
  if (!e.active) return { ok: false, message: `${e.name}'s badge is inactive` };

  await m.lock(`clock:${e.id}`);
  const d = today();
  const row = await m.tx.one("SELECT * FROM attendance WHERE employee_id = $1 AND date = $2 AND clock_out IS NULL LIMIT 1", [e.id, d]);
  if (direction === "in" && row) return { ok: false, message: `Already clocked in at ${fmtTime(toItem("attendance", row).clockIn)} — choose Clock out to leave`, name: e.name };
  if (direction === "out" && !row) return { ok: false, message: "Not clocked in today — choose Clock in first", name: e.name };
  if (row) {
    const open = toItem("attendance", row);
    const mins = (Date.now() - new Date(open.clockIn).getTime()) / 60000;
    if (mins < 1) return { ok: false, message: "Already clocked in a moment ago — duplicate scan ignored", name: e.name };
    await m.update("attendance", open.id, { clockOut: new Date().toISOString() });
    await m.log("HR", "Clock out", `${e.name} (QR)`);
    return { ok: true, message: "Clocked out. Thanks for today!", name: e.name, direction: "out" };
  }
  const clockIn = new Date().toISOString();
  await m.insert("attendance", { id: uid("at"), employeeId: e.id, date: d, clockIn, method: "qr", ...arrivalOf(e.workHours, clockIn) });
  await m.log("HR", "Clock in", `${e.name} (QR)`);
  return { ok: true, message: "Clocked in. Have a great shift!", name: e.name, direction: "in" };
}

export interface StaffLogin {
  username: string;
  roleId: string;
  email: string;
}

/**
 * Add or edit an employee and, in the same step, optionally give them an app login with a role.
 * Both are saved in one transaction through the normal rules (permissions, unique username, owner
 * role); the login gets a one-time password that is returned once and must be changed at first sign-in.
 */
export async function saveStaff(m: Mut, emp: Employee, login?: StaffLogin) {
  if (!m.actor.can("hr.edit")) throw new HttpError(403, "You don't have permission to do that");
  if (!emp.name.trim()) throw badRequest("Enter the employee's name");
  if (login && !m.actor.can("users.edit")) throw new HttpError(403, "Creating logins needs the “Users” edit permission");
  const existing = await m.find("employees", emp.id);
  const employee = await saveRecord(m, "employees", emp, "HR", `Employee ${emp.name}`);
  const [linked] = await m.rows("users", "SELECT * FROM users WHERE employee_id = $1", [employee.id]);

  if (login) {
    if (linked) throw badRequest(`${employee.name} already has a login (${linked.username})`);
    const password = tempPassword();
    const user: User = {
      id: uid("u"),
      name: employee.name,
      username: login.username,
      email: login.email.trim(),
      phone: employee.phone,
      roleId: login.roleId,
      active: employee.active,
      employeeId: employee.id,
      password,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    const saved = await saveRecord(m, "users", user, "Users", `Created login ${login.username.trim().toLowerCase()} for ${employee.name}`);
    return { employee, user: saved, tempPassword: password };
  }

  // someone who leaves loses app access too (the owner account is never switched off this way)
  if (linked?.active && existing?.active && !employee.active && linked.roleId !== "owner" && linked.id !== m.actor.id && m.actor.can("users.edit")) {
    await saveRecord(m, "users", { ...linked, active: false }, "Users", `Deactivated login ${linked.username} — ${employee.name} marked inactive`);
  }
  return { employee };
}
