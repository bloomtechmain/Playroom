-- Employment types (permanent, non-permanent, part-time) and, separately, how each person is paid
-- (monthly salary, daily rate or hourly rate).
-- Safe to run more than once:  sudo -u playroom psql playroom -f scripts/migrations/004-employment-types.sql
BEGIN;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'permanent';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_basis text NOT NULL DEFAULT 'monthly';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rate numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_pay_basis_check;
ALTER TABLE employees ADD CONSTRAINT employees_pay_basis_check CHECK (pay_basis IN ('monthly', 'daily', 'hourly'));
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employment_type_check;
ALTER TABLE employees ADD CONSTRAINT employees_employment_type_check CHECK (employment_type IN ('permanent', 'non_permanent', 'part_time'));
COMMIT;
