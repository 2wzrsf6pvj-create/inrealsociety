-- 030_rls_members_complete.sql
-- Ferme la dernière fuite GDPR sur members : un user authentifié pouvait
-- toujours SELECT email/stripe_customer_id/stripe_subscription_id/plan_expires_at
-- d'autres membres via le client JS (la policy members_select_public USING(true)
-- accordait l'accès, et le REVOKE column-level de la migration 026 ne couvrait
-- QUE le rôle anon).
--
-- Approche :
--   1. REVOKE column-level pour le rôle authenticated également
--   2. Fonction RPC get_own_member() SECURITY DEFINER pour que l'utilisateur
--      puisse récupérer SON PROPRE profil complet (la fonction tourne en
--      service_role et bypass donc le REVOKE)
--
-- Les routes API serveur qui ont besoin de email/stripe_* d'autres membres
-- (ex: /api/scan, /api/message, /api/webhook/stripe) utilisent supabaseAdmin
-- = service_role, donc inchangées.

-- ─── 1. REVOKE column-level pour authenticated ──────────────────────────────
REVOKE SELECT (email, stripe_customer_id, stripe_subscription_id, plan_expires_at)
  ON members FROM authenticated;

-- ─── 2. RPC pour lire son propre profil complet ─────────────────────────────
-- SECURITY DEFINER : la fonction s'exécute avec les privilèges du créateur
-- (postgres en général), donc bypass les column-level REVOKE.
-- STABLE : pas d'écriture, optimisable en cache de transaction.

CREATE OR REPLACE FUNCTION get_own_member()
RETURNS members
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_own_member() TO authenticated;
REVOKE EXECUTE ON FUNCTION get_own_member() FROM anon, public;

COMMENT ON FUNCTION get_own_member() IS
  'Retourne le profil complet (incluant email, stripe_*, plan_expires_at)
de l''utilisateur authentifié. Bypass le REVOKE column-level via SECURITY
DEFINER. Refuse silencieusement si appelé en anon (aucune row ne match).';
