-- 036_cleanup_push_subscriptions.sql
-- Ajoute la purge des push_subscriptions à cleanup_old_data().
--
-- Les subscriptions des SCANNERS (créées par /api/push/subscribe avec
-- member_id NULL et un message_id SANS FK) n'étaient nettoyées par rien :
--   * pas la cascade member_id (NULL),
--   * pas de FK message_id (inexistante) → suppression de message ne cascade pas,
--   * pas le cleanup (ne les listait pas).
-- Elles s'accumulaient indéfiniment (un endpoint push = pseudo-identifiant de
-- device). Les conversations étant éphémères (fenêtre 24-48h, thread de 5 msgs),
-- une sub > 90 jours concerne forcément une conversation terminée.

-- ⚠️ DROP obligatoire : on change le set de colonnes de RETURNS TABLE (4→5),
-- ce que CREATE OR REPLACE refuse ("cannot change return type"). IF EXISTS pour
-- rester idempotent / ré-exécutable.
DROP FUNCTION IF EXISTS cleanup_old_data();

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
    DELETE FROM audit_logs WHERE created_at < (now() - interval '12 months') RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE viewed_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

-- Défense en profondeur : DROP réinitialise les grants → on relock à service_role
-- (fonction SECURITY DEFINER faisant des DELETE de masse ; appelée par le cron
-- via supabaseAdmin). Aligne sur record_scan (034) / create_member (035).
REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;
