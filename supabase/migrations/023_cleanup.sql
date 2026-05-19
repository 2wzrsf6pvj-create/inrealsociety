-- 023_cleanup.sql
-- Fonction de nettoyage des données expirées. Appelée soit par pg_cron
-- (Supabase dashboard), soit par l'endpoint POST /api/cron/cleanup
-- (Vercel Cron, GitHub Actions, etc.) via un secret partagé.
--
-- Rétentions appliquées :
--  * audit_logs   : 12 mois (CNIL recommande ~12 mois pour logs de sécurité)
--  * activation_codes non utilisés : 90 jours (équivaut à TTL pour codes orphelins)
--  * scans        : 24 mois (cohérent avec la politique de confidentialité)
--  * silent_views : 24 mois

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted        BIGINT,
  activation_codes_deleted  BIGINT,
  scans_deleted             BIGINT,
  silent_views_deleted      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
BEGIN
  -- audit_logs > 12 mois
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE created_at < (now() - interval '12 months')
    RETURNING id
  )
  SELECT count(*) INTO v_audit_logs FROM deleted;

  -- activation_codes non utilisés > 90 jours
  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false
      AND created_at < (now() - interval '90 days')
    RETURNING code
  )
  SELECT count(*) INTO v_activation_codes FROM deleted;

  -- scans > 24 mois
  WITH deleted AS (
    DELETE FROM scans
    WHERE scanned_at < (now() - interval '24 months')
    RETURNING id
  )
  SELECT count(*) INTO v_scans FROM deleted;

  -- silent_views > 24 mois
  WITH deleted AS (
    DELETE FROM silent_views
    WHERE viewed_at < (now() - interval '24 months')
    RETURNING id
  )
  SELECT count(*) INTO v_silent_views FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views;
END;
$$;

-- Pour planifier en pg_cron (extension Supabase paid plan) :
--   SELECT cron.schedule('irs-cleanup', '0 3 * * 0', $$SELECT cleanup_old_data();$$);
-- Sinon, déclencher POST /api/cron/cleanup avec header x-cron-secret depuis Vercel Cron.
