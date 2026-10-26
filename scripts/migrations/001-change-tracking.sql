-- Upgrade an existing database for change tracking (safe to run more than once):
--   sudo -u postgres psql playroom -f scripts/migrations/001-change-tracking.sql
BEGIN;

-- ---------------------------------------------------------------- change tracking
-- Every write stamps the rows it touched with the new state revision (in commit order), so open screens
-- download only what changed since their last refresh instead of the whole data set.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS roles_rev_idx ON roles (rev);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS users_rev_idx ON users (rev);
ALTER TABLE zones ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS zones_rev_idx ON zones (rev);
ALTER TABLE rate_plans ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS rate_plans_rev_idx ON rate_plans (rev);
ALTER TABLE price_rules ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS price_rules_rev_idx ON price_rules (rev);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS promotions_rev_idx ON promotions (rev);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS customers_rev_idx ON customers (rev);
ALTER TABLE children ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS children_rev_idx ON children (rev);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS tickets_rev_idx ON tickets (rev);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS transactions_rev_idx ON transactions (rev);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS products_rev_idx ON products (rev);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sales_rev_idx ON sales (rev);
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS party_packages_rev_idx ON party_packages (rev);
ALTER TABLE addons ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS addons_rev_idx ON addons (rev);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS bookings_rev_idx ON bookings (rev);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS shifts_rev_idx ON shifts (rev);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS refunds_rev_idx ON refunds (rev);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS expenses_rev_idx ON expenses (rev);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS employees_rev_idx ON employees (rev);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS attendance_rev_idx ON attendance (rev);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS payroll_runs_rev_idx ON payroll_runs (rev);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS activity_rev_idx ON activity (rev);

-- deleted records, so screens can drop them too
CREATE TABLE IF NOT EXISTS deleted_rows (
  collection text NOT NULL,
  id         text NOT NULL,
  rev        bigint NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS deleted_rows_rev_idx ON deleted_rows (rev);

-- the last committed revision; settings_rev / reset_rev: when settings last changed / everything was replaced
CREATE TABLE IF NOT EXISTS state_version (
  id           int PRIMARY KEY CHECK (id = 1),
  rev          bigint NOT NULL,
  settings_rev bigint NOT NULL DEFAULT 0,
  reset_rev    bigint NOT NULL DEFAULT 0
);
-- an existing database: every screen does one full reload after the upgrade
INSERT INTO state_version (id, rev, settings_rev, reset_rev) SELECT 1, nextval('state_rev'), currval('state_rev'), currval('state_rev') ON CONFLICT (id) DO NOTHING;

COMMIT;
