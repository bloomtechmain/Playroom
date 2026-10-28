-- Party check-in / check-out by booking QR, and overtime charged for staying past the booked end
-- (safe to run more than once):  sudo -u playroom psql playroom -f scripts/migrations/006-party-overtime.sql
BEGIN;
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS overtime_room_per_hour numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS overtime_full_per_hour numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE party_packages ADD COLUMN IF NOT EXISTS overtime_grace_min integer NOT NULL DEFAULT 10;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS overtime_min integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS overtime_charge numeric(14, 2);
COMMIT;
