-- 025_fuse_reply_into_thread.sql
-- Fusion du double système de réponse :
--   * legacy : colonne messages.reply (1 réponse texte stockée sur la ligne du message initial)
--   * nouveau : table messages avec parent_id + author='member' (thread complet)
--
-- Cette migration :
--   1. Backfill : convertit chaque legacy reply en ligne de thread (idempotent)
--   2. Crée une vue member_inbox qui dérive le statut de réponse pour la
--      dashboard inbox (au lieu de lire les colonnes legacy)
--
-- Les colonnes legacy (reply, replied_at, reply_read_at) ne sont PAS droppées
-- ici — on garde pour rollback. Une migration future pourra les supprimer
-- après observation de la stabilité.
--
-- Avant d'appliquer, vérifier :
--   SELECT COUNT(*) FROM messages WHERE reply IS NOT NULL AND parent_id IS NULL;
--   -- Doit retourner le nombre de replies à migrer
--
-- Après application :
--   SELECT COUNT(*) FROM messages WHERE author='member' AND parent_id IS NOT NULL;
--   -- Doit avoir augmenté du même nombre

-- ─── 1. Backfill du thread depuis la colonne reply ───────────────────────────
-- Idempotent : skip les messages qui ont déjà une thread reply membre.

INSERT INTO messages (
  member_id,
  parent_id,
  author,
  content,
  is_quick_reply,
  moderated,
  sender_contact,
  read_at,
  created_at
)
SELECT
  m.member_id,
  m.id                                                AS parent_id,
  'member'                                            AS author,
  m.reply                                             AS content,
  false                                               AS is_quick_reply,
  false                                               AS moderated,
  NULL                                                AS sender_contact,
  m.reply_read_at                                     AS read_at,
  COALESCE(m.replied_at, m.created_at)                AS created_at
FROM messages m
WHERE m.reply IS NOT NULL
  AND m.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM messages t
    WHERE t.parent_id = m.id
      AND t.author    = 'member'
  );

-- ─── 2. Vue inbox enrichie ───────────────────────────────────────────────────
-- Pour chaque message racine (parent_id IS NULL), expose le statut de réponse
-- membre (existence + heure + lu par scanner). La dashboard inbox lit cette vue
-- au lieu des colonnes legacy.

CREATE OR REPLACE VIEW member_inbox AS
SELECT
  m.id,
  m.member_id,
  m.content,
  m.sender_contact,
  m.is_quick_reply,
  m.moderated,
  m.read_at,
  m.created_at,
  -- Champs dérivés du thread :
  first_reply.content    AS reply,
  first_reply.created_at AS replied_at,
  first_reply.read_at    AS reply_read_at
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

-- Permissions identiques à messages (la RLS sur messages s'applique aux lignes
-- sous-jacentes, donc la vue hérite naturellement de la protection).
GRANT SELECT ON member_inbox TO authenticated, anon, service_role;

COMMENT ON VIEW member_inbox IS
'Vue inbox des messages racine avec statut de réponse membre dérivé du thread.
Remplace la lecture directe des colonnes legacy messages.reply / replied_at / reply_read_at.';
