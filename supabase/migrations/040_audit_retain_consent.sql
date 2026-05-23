-- 040_audit_retain_consent.sql
-- RGPD M2 : la purge cleanup_old_data() supprimait TOUS les audit_logs > 12 mois,
-- y compris la PREUVE DE CONSENTEMENT marketing (member.marketing_consent_changed,
-- art. 7 RGPD) et les preuves d'opérations RGPD (export, suppression, reclaim).
-- Détruire ces traces > 12 mois affaiblit la capacité à prouver qu'on avait bien
-- le consentement (ou qu'on a honoré une demande). On les EXEMPTE de la purge.
-- Volume négligeable (événements rares au niveau membre) vs message/scan.
--
-- Changement de CORPS uniquement (même RETURNS TABLE) → CREATE OR REPLACE suffit
-- (préserve les grants ; on les ré-affirme par sécurité).

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
  -- Purge des audit_logs > 12 mois SAUF les preuves de consentement / d'opérations
  -- RGPD, conservées comme preuve (art. 7 + traçabilité des droits exercés).
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
    DELETE FROM silent_views WHERE viewed_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;
