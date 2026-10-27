-- Allow staff alerts in the WhatsApp queue (safe to run more than once):
--   sudo -u postgres psql playroom -f scripts/migrations/002-staff-whatsapp.sql
BEGIN;
ALTER TABLE whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_kind_check;
ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_kind_check
  CHECK (kind IN ('checkin', 'receipt', 'birthday', 'promotion', 'manual', 'staff'));
COMMIT;
