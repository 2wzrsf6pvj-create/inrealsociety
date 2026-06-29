-- 045_fix_members_update_and_cleanup.sql
-- Deux bugs trouvés à la revue complète 2026-06-27.

-- ─── 🔴 #1. Escalade de privilèges : UPDATE colonne-libre sur members ──────────
-- members_update_own (002) ne contrôle que la LIGNE (auth.uid()=auth_user_id) ;
-- aucun contrôle de COLONNE. Le rôle authenticated garde le GRANT UPDATE par défaut
-- → un membre peut PATCH /rest/v1/members?id=eq.<self> avec {plan:'premium',
-- plan_expires_at:'2099-...', scan_count:99999, stripe_subscription_id:...} depuis
-- le navigateur (clé anon) → s'auto-octroie le premium (bypass Stripe total) et
-- gonfle ses métriques.
-- Fix : REVOKE UPDATE — l'app n'écrit JAMAIS members côté client (tout passe par
-- supabaseAdmin / RPC SECURITY DEFINER = service_role, non affecté). 041 n'avait
-- fermé que le SELECT (colonnes) + le RPC increment_scan_count, pas l'UPDATE direct.
REVOKE UPDATE ON members FROM anon, authenticated;

-- ─── 🔴 #2. cleanup_old_data() référence silent_views.viewed_at (inexistant) ───
-- silent_views est créée avec `created_at` (015) ; aucun rename vers viewed_at
-- n'existe. La fonction DELETE ... WHERE viewed_at → échoue à l'exécution sur une
-- base conforme aux migrations → cron /api/cron/cleanup en 500 → plus AUCUNE purge
-- RGPD (audit/scans/silent_views/push). Corps inchangé sinon (cf. 040), juste la
-- colonne corrigée en created_at.
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE created_at < (now() - interval '12 months')
      AND action NOT IN (
        'member.marketing_consent_changed',
        'member.data_exported',
        'member.deleted',
        'member.reclaimed'
      )
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE created_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;
