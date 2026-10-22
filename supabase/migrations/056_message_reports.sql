-- 056_message_reports.sql
-- Signalements de messages par les porteurs, pour le bannissement automatique.
--
-- Avant : un signalement masquait le message (moderated = true) et laissait une
-- ligne dans audit_logs, sans alerte ni suite ; bannir un appareil se faisait à
-- la main (banned_devices, migration 046). Désormais /api/report enregistre ici
-- le signalement : un appareil (sender_token) signalé par REPORT_BAN_THRESHOLD
-- porteurs différents est banni automatiquement.
--
-- Une ligne par (porteur, appareil) : un porteur qui signale plusieurs messages
-- du même appareil ne compte qu'une fois. sender_token NULL = appareil inconnu
-- (message antérieur aux jetons) : enregistré, jamais compté.

CREATE TABLE IF NOT EXISTS message_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  sender_token TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Contrainte (et non index partiel) : l'ON CONFLICT de PostgREST doit pouvoir
  -- la cibler. Les NULL restant distincts, les appareils inconnus n'y sont pas soumis.
  CONSTRAINT message_reports_member_device_uniq UNIQUE (member_id, sender_token)
);

CREATE INDEX IF NOT EXISTS idx_message_reports_sender_token
  ON message_reports (sender_token) WHERE sender_token IS NOT NULL;

-- Aucun accès anon/authenticated : seul service_role (supabaseAdmin) lit/écrit.
ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON message_reports FROM anon, authenticated;
