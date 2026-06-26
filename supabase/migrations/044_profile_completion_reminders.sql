-- 044_profile_completion_reminders.sql
-- Relance « compte créé mais profil jamais finalisé » : un acheteur qui a payé,
-- confirmé son email et créé son compte auth MAIS abandonné l'étape profil →
-- aucun `members` lié → le fulfillment Printful n'est jamais déclenché → t-shirt
-- payé jamais fabriqué. Détecté par le funnel (account_created sans member_created).
-- Le cron /api/cron/activation-reminder les relance UNE fois.

-- Suivi des relances envoyées (idempotence : une seule relance par compte).
CREATE TABLE IF NOT EXISTS profile_completion_reminders (
  auth_user_id UUID PRIMARY KEY,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profile_completion_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profile_completion_reminders FROM anon, authenticated;  -- service_role only

-- Comptes auth confirmés, SANS profil membre, créés il y a 2 h–7 j, pas encore
-- relancés. SECURITY DEFINER : lit auth.users (hors schéma public). search_path
-- figé + EXECUTE révoqué pour anon/public (jamais appelable à la clé anon).
CREATE OR REPLACE FUNCTION accounts_pending_profile()
RETURNS TABLE(auth_user_id UUID, email TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email
  FROM auth.users u
  LEFT JOIN members m                       ON m.auth_user_id = u.id
  LEFT JOIN profile_completion_reminders r  ON r.auth_user_id = u.id
  WHERE m.id IS NULL                       -- pas de profil
    AND r.auth_user_id IS NULL             -- pas déjà relancé
    AND u.email_confirmed_at IS NOT NULL   -- email confirmé (vrai abandon, pas mi-flux)
    AND u.email IS NOT NULL
    AND u.created_at < now() - interval '2 hours'   -- laisse le temps de finir seul
    AND u.created_at > now() - interval '7 days'     -- ne harcèle pas les comptes périmés
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION accounts_pending_profile() FROM anon, public;
GRANT  EXECUTE ON FUNCTION accounts_pending_profile() TO service_role;
