-- 038_require_contact_and_inbox_blocked.sql
-- Compléments sécurité « grade produit » (suite de 037) :
--   1. members.require_contact : le porteur peut exiger un contact (@insta/email)
--      pour qu'un scanneur puisse lui écrire (réduit le harcèlement anonyme).
--   2. member_inbox expose blocked_at → la dashboard peut afficher un badge
--      « Bloqué » sans ouvrir la conversation.
-- Idempotent.

-- ─── 1. require_contact ──────────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS require_contact BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. member_inbox + blocked_at ────────────────────────────────────────────
-- CREATE OR REPLACE : on garde l'ordre exact des colonnes existantes (contrainte
-- Postgres) et on ajoute blocked_at EN DERNIER. On ré-affirme security_invoker
-- (durcissement 033 — un simple CREATE OR REPLACE pourrait le réinitialiser) et
-- le REVOKE anon/authenticated. JAMAIS sender_token dans la vue (donnée tierce).
CREATE OR REPLACE VIEW member_inbox WITH (security_invoker = on) AS
SELECT
  m.id,
  m.member_id,
  m.content,
  m.sender_contact,
  m.is_quick_reply,
  m.moderated,
  m.read_at,
  m.created_at,
  first_reply.content    AS reply,
  first_reply.created_at AS replied_at,
  first_reply.read_at    AS reply_read_at,
  m.blocked_at
FROM messages m
LEFT JOIN LATERAL (
  SELECT content, created_at, read_at
  FROM messages
  WHERE parent_id = m.id
    AND author    = 'member'
    AND moderated = false
  ORDER BY created_at ASC
  LIMIT 1
) first_reply ON true
WHERE m.parent_id IS NULL;

-- Ré-affirme le durcissement de 033.
REVOKE SELECT ON member_inbox FROM anon, authenticated;
GRANT  SELECT ON member_inbox TO service_role;
