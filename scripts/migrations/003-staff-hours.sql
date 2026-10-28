-- Staff working hours and late / early arrivals (safe to run more than once):
--   sudo -u playroom psql playroom -f scripts/migrations/003-staff-hours.sql
BEGIN;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_hours jsonb;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS scheduled_in text;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS in_diff_min integer;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS punctuality text;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_punctuality_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_punctuality_check CHECK (punctuality IN ('early', 'on_time', 'late', 'off_day'));
-- the Administrator role sees and sets working hours (the owner role always has everything)
UPDATE roles SET permissions = array_append(permissions, 'hr.hours') WHERE id = 'admin' AND NOT ('hr.hours' = ANY (permissions));
COMMIT;
