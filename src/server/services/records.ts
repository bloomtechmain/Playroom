import "server-only";
import { format } from "date-fns";
import type { Booking, Customer, Expense, PayrollRun, Role, User } from "@/lib/types";
import { uid } from "@/lib/utils";
import type { CollectionKey, Item } from "../collections";
import { badRequest, HttpError } from "../http";
import { diff, type Mut } from "../mutation";
import { hashPassword } from "../password";
import { updateBooking } from "./bookings";

/**
 * Which permission lets a user create/edit records of a collection through the generic save.
 * Collections that carry money or history (tickets, sales, transactions, shifts, refunds, activity)
 * are deliberately absent: they only change through their own endpoints.
 */
const EDIT: Partial<Record<CollectionKey, { perms: string[]; removable?: boolean }>> = {
  roles: { perms: ["roles.edit"] },
  users: { perms: ["users.edit"] },
  zones: { perms: ["zones.edit"] },
  ratePlans: { perms: ["pricing.edit"], removable: true },
  rules: { perms: ["pricing.edit"], removable: true },
  promotions: { perms: ["promotions.edit"], removable: true },
  customers: { perms: ["customers.edit", "wallet.adjust"] },
  children: { perms: ["customers.edit"] },
  products: { perms: ["products.edit"] },
  packages: { perms: ["packages.edit"] },
  addons: { perms: ["packages.edit"] },
  bookings: { perms: ["bookings.edit"] },
  expenses: { perms: ["expenses.edit", "payroll.run", "products.edit"], removable: true },
  employees: { perms: ["hr.edit"] },
  attendance: { perms: ["hr.edit"] },
  payroll: { perms: ["payroll.run"] },
};

const deny = (msg = "You don't have permission to do that") => new HttpError(403, msg);

export async function saveRecord<K extends CollectionKey>(m: Mut, key: K, item: Item<K>, module: string, label: string, opts: { quiet?: boolean } = {}) {
  const rule = EDIT[key];
  const id = (item as { id?: string }).id;
  if (!id) throw badRequest("Missing id");
  const self = key === "users" && id === m.actor.id;
  if (!rule || !(rule.perms.some((p) => m.actor.can(p)) || self)) throw deny();

  const existing = await m.find(key, id, { lock: true });
  let saved: Item<K>;
  let before = existing as unknown as Record<string, unknown> | undefined;

  switch (key) {
    case "users":
      saved = (await saveUser(m, item as User, existing as User | undefined)) as Item<K>;
      break;
    case "roles": {
      const r = item as Role;
      if ((existing as Role | undefined)?.locked) throw deny("The owner role always has full access");
      saved = (await m.put("roles", { ...r, locked: undefined })) as Item<K>;
      break;
    }
    case "customers": {
      const c = item as Customer;
      const ex = existing as Customer | undefined;
      const pointsChanged = c.points !== (ex?.points ?? 0);
      if (pointsChanged && !m.actor.can("wallet.adjust")) throw deny("Adjusting points needs the wallet permission");
      if (!m.actor.can("customers.edit") && !pointsChanged) throw deny();
      // the wallet only moves through top-ups, payments and refunds
      saved = (await m.put("customers", { ...c, wallet: ex?.wallet ?? 0, createdAt: ex?.createdAt ?? c.createdAt ?? new Date().toISOString() })) as Item<K>;
      break;
    }
    case "bookings": {
      if (!existing) throw badRequest("New bookings are created from the booking form");
      saved = (await updateBooking(m, item as Booking)).after as Item<K>;
      break;
    }
    case "expenses": {
      const x = item as Expense;
      const ok =
        m.actor.can("expenses.edit") ||
        (m.actor.can("payroll.run") && !!x.payrollRunId && !existing) ||
        (m.actor.can("products.edit") && x.category === "Stock Purchases" && !existing);
      if (!ok) throw deny();
      saved = (await m.put("expenses", { ...x, createdBy: (existing as Expense | undefined)?.createdBy ?? m.actor.id })) as Item<K>;
      break;
    }
    case "payroll": {
      const ex = existing as PayrollRun | undefined;
      if (ex?.status === "paid") throw badRequest("This payroll run has already been paid");
      if (!ex && (await m.tx.one("SELECT 1 FROM payroll_runs WHERE month = $1 AND id <> $2", [(item as PayrollRun).month, id])))
        throw badRequest("Payroll for this month already exists");
      saved = (await m.put("payroll", item as PayrollRun)) as Item<K>;
      break;
    }
    default:
      saved = await m.put(key, item);
  }

  if (!opts.quiet) {
    if (before) {
      if (key === "users") before = { ...before, password: undefined };
      const d = diff(before, saved as unknown as Record<string, unknown>);
      await m.log(module, "Updated", label, undefined, d || "no field changes");
    } else await m.log(module, "Created", label);
  }
  return saved;
}

async function saveUser(m: Mut, u: User, ex: User | undefined) {
  const admin = m.actor.can("users.edit");
  if (!admin) {
    // signed-in users may only edit their own contact details (password has its own endpoint)
    if (!ex) throw deny();
    return m.put("users", { ...ex, name: u.name, email: u.email, phone: u.phone }, { passwordHash: await currentHash(m, ex.id) });
  }
  const username = u.username.trim().toLowerCase();
  if (!u.name.trim() || !username) throw badRequest("Name and username are required");
  if (await m.tx.one("SELECT 1 FROM users WHERE lower(username) = $1 AND id <> $2", [username, u.id])) throw badRequest("Username already taken");
  if (ex) {
    if (ex.id === m.actor.id && !u.active) throw badRequest("You can't deactivate your own account");
    if (ex.roleId === "owner" && (!u.active || u.roleId !== "owner")) throw badRequest("The owner account can't be deactivated or demoted");
  }
  if (u.roleId === "owner" && ex?.roleId !== "owner" && m.actor.roleId !== "owner") throw deny("Only the owner can grant the owner role");
  if (!(await m.find("roles", u.roleId))) throw badRequest("Unknown role");

  const passwordHash = u.password ? await hashPassword(u.password) : ex ? await currentHash(m, ex.id) : undefined;
  if (!passwordHash) throw badRequest("A password is required for new users");
  const { password, ...rest } = u;
  void password;
  return m.put("users", { ...rest, username, lastLogin: ex?.lastLogin, createdAt: ex?.createdAt ?? u.createdAt } as User, { passwordHash });
}

async function currentHash(m: Mut, id: string) {
  return (await m.tx.one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [id]))?.password_hash;
}

export async function removeRecord(m: Mut, key: CollectionKey, id: string, module: string, label: string) {
  const rule = EDIT[key];
  if (!rule?.removable) throw deny("These records can't be deleted");
  if (!rule.perms.some((p) => m.actor.can(p))) throw deny();
  if (key === "expenses" && !m.actor.can("expenses.edit")) throw deny();
  if (!(await m.find(key, id))) return;
  await m.delete(key, id);
  await m.log(module, "Deleted", label);
}

/** Mark a payroll run paid and post salaries + employer EPF/ETF to expenses, all or nothing. */
export async function payPayroll(m: Mut, id: string) {
  const run = (await m.get("payroll", id, "Payroll run", { lock: true })) as PayrollRun;
  if (run.status === "paid") throw badRequest("This payroll run has already been paid");
  const settings = await m.settings();
  const gross = run.lines.reduce((a, l) => a + l.gross, 0);
  const er = run.lines.reduce((a, l) => a + l.epfEmployer + l.etfEmployer, 0);
  const label = format(new Date(run.month + "-01"), "MMMM yyyy");
  const date = format(new Date(), "yyyy-MM-dd");
  await m.update("payroll", id, { status: "paid", paidAt: new Date().toISOString() });
  await m.log("Payroll", "Updated", `Paid payroll ${run.month}`, undefined, "status: draft → paid");
  await m.insert("expenses", { id: uid("x"), date, category: "Salaries", description: `Salaries — ${label}`, vendor: "Staff payroll", amount: gross, paidFrom: "bank", payrollRunId: id, createdBy: m.actor.id });
  await m.log("Expenses", "Created", `Salaries ${label}`);
  if (er > 0) {
    await m.insert("expenses", {
      id: uid("x"),
      date,
      category: "EPF / ETF (Employer)",
      description: `Employer EPF ${settings.epfEmployerPct}% + ETF ${settings.etfPct}% — ${label}`,
      vendor: "Central Bank / ETF Board",
      amount: er,
      paidFrom: "bank",
      payrollRunId: id,
      createdBy: m.actor.id,
    });
    await m.log("Expenses", "Created", `EPF/ETF ${label}`);
  }
}
