-- Qualifications, company training, KPIs and performance marks (safe to run more than once):
--   sudo -u playroom psql playroom -f scripts/migrations/005-staff-development.sql
BEGIN;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS qualifications jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS trainings (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  date         date NOT NULL,
  trainer      text NOT NULL DEFAULT '',
  hours        numeric(8, 2) NOT NULL DEFAULT 0,
  description  text NOT NULL DEFAULT '',
  employee_ids jsonb NOT NULL DEFAULT '[]',
  seq          bigserial NOT NULL,
  rev          bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS trainings_rev_idx ON trainings (rev);

CREATE TABLE IF NOT EXISTS evaluations (
  id           text PRIMARY KEY,
  employee_id  text NOT NULL,
  period       text NOT NULL,
  scores       jsonb NOT NULL DEFAULT '{}',
  notes        text NOT NULL DEFAULT '',
  evaluated_by text NOT NULL DEFAULT '',
  at           timestamptz NOT NULL DEFAULT now(),
  seq          bigserial NOT NULL,
  rev          bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS evaluations_employee_id_period_idx ON evaluations (employee_id, period);
CREATE INDEX IF NOT EXISTS evaluations_rev_idx ON evaluations (rev);

-- the Administrator role sets KPIs and scores staff (the owner role always has everything)
UPDATE roles SET permissions = array_append(permissions, 'hr.evaluate') WHERE id = 'admin' AND NOT ('hr.evaluate' = ANY (permissions));
COMMIT;
