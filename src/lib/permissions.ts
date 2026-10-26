import type { Role } from "./types";

export const PERMISSION_GROUPS: { module: string; items: { key: string; label: string }[] }[] = [
  { module: "Dashboard", items: [{ key: "dashboard.view", label: "View executive dashboard" }] },
  {
    module: "Front Desk & Tickets",
    items: [
      { key: "tickets.sell", label: "Issue tickets / check-in" },
      { key: "tickets.checkout", label: "Check-out & collect payment" },
      { key: "tickets.view", label: "Search & view tickets" },
      { key: "tickets.reprint", label: "Reprint tickets" },
      { key: "tickets.cancel", label: "Cancel tickets" },
    ],
  },
  {
    module: "Zones & Pricing",
    items: [
      { key: "zones.view", label: "View zones & capacity" },
      { key: "zones.edit", label: "Edit zone setup" },
      { key: "pricing.edit", label: "Edit rates & price rules" },
      { key: "promotions.edit", label: "Manage promotions" },
      { key: "price.override", label: "Override price at counter" },
    ],
  },
  {
    module: "Customers",
    items: [
      { key: "customers.view", label: "View CRM profiles" },
      { key: "customers.edit", label: "Create / edit profiles" },
      { key: "wallet.adjust", label: "Top-up wallet / adjust points" },
    ],
  },
  {
    module: "WhatsApp",
    items: [
      { key: "whatsapp.send", label: "Send WhatsApp messages, promotions & birthday wishes" },
      { key: "whatsapp.connect", label: "Link the WhatsApp account & change message settings" },
    ],
  },
  {
    module: "Bookings & Parties",
    items: [
      { key: "bookings.view", label: "View calendar & bookings" },
      { key: "bookings.edit", label: "Create / edit bookings" },
      { key: "packages.edit", label: "Configure party packages" },
    ],
  },
  {
    module: "POS & Cashier",
    items: [
      { key: "pos.sell", label: "Sell products (POS)" },
      { key: "pos.discount", label: "Give discounts" },
      { key: "products.edit", label: "Manage products & stock" },
      { key: "shifts.own", label: "Open / close own shift" },
      { key: "shifts.all", label: "View all shift reports" },
      { key: "refunds.request", label: "Request refunds" },
      { key: "refunds.approve", label: "Approve refunds" },
    ],
  },
  {
    module: "Finance",
    items: [
      { key: "expenses.view", label: "View expenses" },
      { key: "expenses.edit", label: "Record expenses" },
      { key: "reports.view", label: "Financial & operational reports" },
      { key: "payroll.view", label: "View payroll" },
      { key: "payroll.run", label: "Run & pay payroll" },
    ],
  },
  {
    module: "HR",
    items: [
      { key: "hr.view", label: "View staff & attendance" },
      { key: "hr.edit", label: "Manage staff records" },
    ],
  },
  {
    module: "Administration",
    items: [
      { key: "users.view", label: "View user accounts" },
      { key: "users.edit", label: "Create / edit / deactivate users" },
      { key: "roles.edit", label: "Edit roles & permissions" },
      { key: "activity.view", label: "View activity log & audit trail" },
      { key: "settings.edit", label: "System settings & backups" },
      { key: "backups.save", label: "Save the end-of-day backup to this PC's folder (at sign-out / shift close)" },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

const without = (...keys: string[]) => ALL_PERMISSIONS.filter((k) => !keys.includes(k));

export const DEFAULT_ROLES: Role[] = [
  { id: "owner", name: "Owner", description: "Full access to everything", permissions: ALL_PERMISSIONS, locked: true },
  {
    id: "admin",
    name: "Administrator",
    description: "Runs the system day to day",
    permissions: without(),
  },
  {
    id: "manager",
    name: "Manager",
    description: "Floor & shift management, approvals",
    permissions: without("roles.edit", "settings.edit", "payroll.run", "users.edit"),
  },
  {
    id: "cashier",
    name: "Cashier",
    description: "Tickets, POS and own shift",
    permissions: [
      "tickets.sell",
      "tickets.checkout",
      "tickets.view",
      "tickets.reprint",
      "zones.view",
      "customers.view",
      "customers.edit",
      "bookings.view",
      "pos.sell",
      "shifts.own",
      "refunds.request",
      "backups.save",
    ],
  },
  {
    id: "reception",
    name: "Receptionist",
    description: "Welcome desk, check-in and bookings",
    permissions: [
      "tickets.sell",
      "tickets.checkout",
      "tickets.view",
      "tickets.reprint",
      "zones.view",
      "customers.view",
      "customers.edit",
      "bookings.view",
      "bookings.edit",
      "shifts.own",
      "refunds.request",
    ],
  },
  {
    id: "party",
    name: "Party Manager",
    description: "Party bookings, packages, calendar",
    permissions: [
      "dashboard.view",
      "zones.view",
      "customers.view",
      "customers.edit",
      "bookings.view",
      "bookings.edit",
      "packages.edit",
      "tickets.view",
      "shifts.own",
      "refunds.request",
    ],
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Finance, expenses, payroll and reports",
    permissions: [
      "dashboard.view",
      "expenses.view",
      "expenses.edit",
      "reports.view",
      "payroll.view",
      "payroll.run",
      "shifts.all",
      "tickets.view",
      "hr.view",
      "customers.view",
    ],
  },
];
