-- 024_scan_reminder.sql
-- Tracking de l'envoi du reminder J+7 (si scan_count = 0).
-- L'idempotence est garantie par ce timestamp : aucun email envoyé deux fois.

ALTER TABLE members ADD COLUMN IF NOT EXISTS scan_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_members_scan_reminder_candidates
  ON members(created_at)
  WHERE scan_count = 0
    AND scan_reminder_sent_at IS NULL
    AND is_paused = false;
