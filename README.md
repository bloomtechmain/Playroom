# The Playroom — Management System

Operations system for The Playroom kids' play centre: front desk ticketing, live capacity, parties, POS, cashier shifts, CRM, expenses, payroll (EPF/ETF), QR staff attendance and financial reports.

Full-stack TypeScript: **Next.js 16** (App Router, route handlers as the API), **PostgreSQL** with plain SQL through the `pg` driver (no ORM), React 19, Tailwind CSS 4, Zustand, Recharts.

## Run it

Prerequisites: Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env                                                    # set DATABASE_URL and TZ
createdb playroom                                                       # or CREATE DATABASE playroom; in psql
npm run db:init                                                         # create the schema from database.sql
npm run db:create-owner -- <username> <password> "<Full name>" [email]  # standard roles + first Owner login
npm run dev                                                             # http://localhost:3000
# or a production build
npm run build && npm start
```

Sign in as the Owner, then add zones, rates, packages and staff accounts from the app.

`database.sql` is the complete schema — every table, constraint, index and the default settings — in one file. It is meant for an empty database; `npm run db:init` refuses to run if the tables already exist.

| Script | What it does |
|---|---|
| `npm run db:init` | Run `database.sql` on an empty database (no `psql` needed) |
| `npm run db:seed` | Development only: load ~3 months of sample data (only when the database is empty) |
| `npm run db:seed -- --force` | Development only: wipe business data and rebuild the sample data |
| `npm run db:setup` | Development only: `db:init` + `db:seed` |
| `npm run db:create-owner -- …` | Create the standard roles and an Owner account |
| `npm run typecheck` | `tsc --noEmit` |

**Changing the schema:** edit `database.sql` for new installs, write the matching `ALTER TABLE …` for existing databases, and update the column list for that table in `src/server/collections.ts`.

### Environment

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TZ` | Set to the venue's time zone (e.g. `Asia/Colombo`) on the server. Ticket numbers, “today”, attendance dates and the daily backup use the server's local date. |

## Architecture

```
src/
  app/(app)/…, book/, kiosk/, login/   UI (unchanged screens)
  app/api/…                            REST API (route handlers)
  lib/store.ts                         client cache of server data + API calls
  lib/{pricing,booking,payroll,…}.ts   business rules shared by browser and server
  server/
    db/pool.ts                         pg connection pool, query helpers, transactions
    collections.ts                     table/column map + generic INSERT/UPDATE builders
    auth.ts                            sessions (httpOnly cookie, hashed tokens), permissions
    mutation.ts                        one DB transaction per action + audit log + change patch
    services/                          tickets, sales, refunds, bookings, money, hr, records, admin, account
    state.ts                           what each role is allowed to load
database.sql                           complete PostgreSQL schema for fresh deployments
scripts/                               db-init, seed (sample data), create-owner
```

- **Reads.** After sign-in the browser loads the data its role may see (`GET /api/state`); screens compute dashboards and reports from it exactly as before. Payroll, staff, expenses and the full audit log are only sent to roles with permission for them.
- **Writes.** Every change is an API call that runs in a single PostgreSQL transaction. The server checks the permission, re-validates the business rules (capacity, full-venue lock-outs, booking clashes, stock, wallet balance, refund limits, approval rules), writes the audit-log entry and returns the changed rows, which the browser merges.
- **Many screens at once.** Every write bumps a revision number; open screens poll `GET /api/state/rev` every few seconds and refetch when it moves, so front desk, live sessions, kiosk and manager screens stay in step.
- **Security.** Passwords are hashed with scrypt; sessions are random tokens stored hashed, in an httpOnly `SameSite=Lax` cookie, valid for 7 days. Deactivating a user ends their sessions. Repeated failed sign-ins for a username are throttled. New and reset accounts get a random one-time password that must be changed at first sign-in; forgotten passwords are reset by an administrator in *Users & Roles* (no email service is connected). Prices for POS sales and online bookings are taken from the database, not from the browser.
- **Public pages.** `/book` and `/kiosk` use their own endpoints (`/api/public/booking`, `/api/kiosk`) which expose no customer data. No payment gateway is connected: an online booking is a request that holds the slot as *Pending* with nothing paid, and staff confirm it by taking the deposit at the venue.
- **Backups.** The server stores a full snapshot every day (keeps 14) and on *Back up now*; snapshots can be downloaded from Settings and restored from a file (backup files from the old browser-only demo are accepted too).

## Sample data (development only)

`npm run db:setup` on an empty database loads about three months of sample history with one account per role (`owner`, `admin`, `manager`, `cashier`, `reception`, `party`, `accounts`, all with the password `demo123`). Never run it on a live database.

Public pages (no login): **/book** (online booking requests) and **/kiosk** (staff QR clock-in tablet).

## Where each requirement lives

| Scope | Screen |
|---|---|
| 2.1 Accounts, RBAC, granular permissions | Users & Roles (permission matrix per role, password reset with a one-time password), My profile |
| 2.1 Activity tracking / audit trail | Activity Log (before → after for every change, CSV export) |
| 2.2 Zones, hours, capacity, entry rules | Zones & Capacity |
| 2.2 Real-time capacity & cut-off | Dashboard, Front Desk (entry blocked when full), top-bar alerts at near-full |
| 2.3 Time-based rates | Pricing → Rate plans (one price per 30 minutes per zone; stays are rounded up to the next 30 minutes, 30 minutes minimum) |
| 2.3 Weekday/weekend/peak/off-peak/holiday/event rules | Pricing → Day & time rules, Holidays (Poya days), Price checker |
| 2.3 Promotions & targeting | Pricing → Promotions (%, fixed, package, bonus time; min spend, visitors, child age, members, prior visits; caps & dates) |
| 2.4 Thermal & digital tickets with QR | Front Desk → ticket modal (Print / Digital ticket) |
| 2.4 Lifecycle, search, reprint | Tickets (Active / Completed / Cancelled / Expired / Refunded) |
| 2.4 QR scan, time spent, duplicate check | Live Sessions (camera or USB scanner) |
| 2.5 CRM & child profiles | Customers → profile (children, visit log, payments, parties, wallet, points) |
| 2.6 Online booking engine | /book (package, party size, time, booking request + reference QR; confirmed when the deposit is paid at the venue) |
| 2.6 Master calendar, packages, add-ons | Bookings & Parties (calendar, room availability, packages & add-ons) |
| 2.6 Exclusive hire lock-outs | **Full venue** party = party room + play area → walk-ins and online play slots blocked from 30 min before; **Party room only** keeps the play area open. Each package has separate room-only and full-venue prices. |
| 2.7 Payments (cash, card, transfer, LankaQR, wallet) | Front Desk, POS, bookings |
| 2.7 Shift control | Cashier Shifts (float, cash vs card, discount audit, drawer count, variance, shift-end report) |
| 2.7 Refunds with manager approval | Refunds (queue + approve/reject) and approval at the counter with manager credentials |
| 2.7 Accounting & reports | Reports → Profit & Loss, Cash Flow (direct method), Sales, Occupancy, Loyalty & Promotions, Parties |
| 2.7 Executive dashboard | Dashboard |
| 2.7 Backups / infrastructure | Settings → Backups (daily server snapshot, download/restore) |
| Extra: Dedicated POS | POS + Products & Stock (receipt only, no QR) |
| Extra: Expenses → P&L and cash flow | Expenses (feeds both reports automatically) |
| Extra: Payroll with EPF/ETF switches | Payroll (global on/off, rates, per-employee opt-out, payslips; paying posts salaries + employer EPF/ETF to expenses) |
| Extra: HR with QR clock-in/out | Staff (QR badges), Attendance, /kiosk |

## Accounting notes

- **P&L is cash basis.** Party deposits count when received. Wallet top-ups are customer balances (not revenue) until spent. POS cost of goods is deducted as COGS, so stock purchases are not double-counted as expenses. Equipment (capex) and owner drawings are excluded from P&L.
- **Cash flow** uses the direct method: receipts by stream, refunds, operating payments by category, investing (equipment) and financing (owner drawings), with opening and closing balances.
- **EPF/ETF:** employee 8%, employer 12%, ETF 3% of basic (optionally plus fixed allowances). All rates are editable.
