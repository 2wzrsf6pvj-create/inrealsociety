-- 039_message_sender_name.sql
-- Prénom optionnel du scanneur, transmis au porteur.
--
-- Pourquoi : le parcours était trop anonyme au moment décisif. Le prénom était
-- capturé par /unlock (localStorage) mais jamais transmis — le porteur ne voyait
-- qu'un @contact ou « Anonyme ». Pour un produit de rencontre IRL, un prénom
-- humanise le signal bien plus qu'un handle. Champ OPTIONNEL : l'anonymat reste
-- le défaut. Modéré côté API comme le contenu (un nom abusif est droppé).
-- Idempotent.

-- ─── 1. Colonne sender_name ──────────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- ─── 2. member_inbox + sender_name ───────────────────────────────────────────
-- CREATE OR REPLACE : on garde l'ordre EXACT des colonnes existantes (contrainte
-- Postgres) et on ajoute sender_name EN DERNIER (après blocked_at, ajouté en
-- 038). On ré-affirme security_invoker (033) et le REVOKE anon/authenticated.
-- JAMAIS sender_token dans la vue (donnée tierce). sender_name, lui, est destiné
-- au porteur (son inbox owner-only) — sûr à exposer ici.
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
  m.blocked_at,
  m.sender_name
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
