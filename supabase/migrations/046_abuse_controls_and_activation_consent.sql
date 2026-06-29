-- 046_abuse_controls_and_activation_consent.sql
-- Trois chantiers issus de la revue design QR→messagerie (2026-06-29) :
--   §5  bannissement global d'un device (cross-porteurs) + trace d'abus durable
--   §8/9 consentement bien/service horodaté à l'activation
-- (Le §4 « un seul message par device » est purement applicatif — pas de SQL.)

-- ─── §5a. Bannissement GLOBAL d'un device (sender_token) ──────────────────────
-- Le blocage existant (table `blocks`) est par-porteur. Pour le harcèlement EN
-- SÉRIE (même device, plusieurs porteurs), l'ops a besoin d'un ban global. Le
-- sender_token étant le même device sur tous les porteurs, on le bannit ici une
-- fois. Peuplée manuellement par l'ops (SQL / dashboard) après corrélation des
-- sender_token dans audit_logs ; pas d'UI admin pour l'instant.
CREATE TABLE IF NOT EXISTS banned_devices (
  sender_token TEXT PRIMARY KEY,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aucun accès anon/authenticated : seul service_role (supabaseAdmin) lit/écrit.
ALTER TABLE banned_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON banned_devices FROM anon, authenticated;

-- ─── §8/9. Consentement d'activation (preuve juridique) ───────────────────────
-- terms_accepted_at      : acceptation CGV/CGU horodatée.
-- service_waiver_at       : demande d'exécution immédiate du SERVICE + renonciation
--                           au droit de rétractation SUR LE SERVICE (le t-shirt
--                           reste un bien rétractable 14 j). Sépare bien/service.
-- Colonnes privées : hors allowlist SELECT publique (042), écrites par service_role.
ALTER TABLE members ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS service_waiver_at TIMESTAMPTZ;

-- ─── §5b + §6. Rétention différenciée des logs d'abus ────────────────────────
-- cleanup_old_data() purge audit_logs à 12 mois. On veut :
--   - garder la TRACE d'abus plus longtemps que le contenu (qui, lui, est purgé) :
--     message.moderated / message.reported / conversation.blocked → 24 mois ;
--   - exempter durablement les PREUVES de consentement, dont la nouvelle
--     member.activated (preuve CGV + renonciation service) — comme les autres.
-- (Reprend 045 à l'identique sauf le bloc audit_logs.)
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
    WHERE action NOT IN (
        -- Preuves de consentement / opérations RGPD : conservées (pas de purge)
        'member.marketing_consent_changed',
        'member.data_exported',
        'member.deleted',
        'member.reclaimed',
        'member.activated'
      )
      AND (
        -- Trace d'abus : rétention étendue à 24 mois (le contenu, lui, est purgé)
        (action IN ('message.moderated', 'message.reported', 'conversation.blocked')
           AND created_at < (now() - interval '24 months'))
        OR
        -- Tout le reste : 12 mois
        (action NOT IN ('message.moderated', 'message.reported', 'conversation.blocked')
           AND created_at < (now() - interval '12 months'))
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
