-- 029_drop_legacy_reply_columns.sql
-- Supprime définitivement les colonnes legacy messages.reply / replied_at /
-- reply_read_at. La migration 025 a backfillé leurs valeurs dans le thread
-- (rows avec parent_id + author='member') et la vue member_inbox dérive ces
-- champs pour la dashboard inbox.
--
-- ⚠️ AVANT d'appliquer cette migration en prod :
--   1. Vérifier que 025_fuse_reply_into_thread.sql a bien été exécutée :
--      SELECT COUNT(*) FROM messages WHERE author='member' AND parent_id IS NOT NULL;
--      -- Doit être ≥ ce qu'il y avait dans reply column avant
--
--   2. Vérifier que plus aucune code ne lit ces colonnes directement :
--      git grep -E "\\.reply\\b|replied_at|reply_read_at" src/
--      -- Doit retourner uniquement la vue member_inbox (dans la migration 025)
--      -- ou les noms de paramètres email/emailReponse (string params, pas DB)
--
--   3. Période d'observation après 025 : ≥ 2 semaines en prod sans bug observé.

ALTER TABLE messages DROP COLUMN IF EXISTS reply;
ALTER TABLE messages DROP COLUMN IF EXISTS replied_at;
ALTER TABLE messages DROP COLUMN IF EXISTS reply_read_at;

-- La vue member_inbox reste valide car elle dérive ces noms de colonnes
-- depuis le thread (LATERAL JOIN), donc ils sont créés à la volée par la vue
-- et non lus depuis la table messages.
