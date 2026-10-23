-- 062_push_porteurs_telephone.sql
-- Mesurer les notifications (choix de Clément, 2026-10-23).
--
-- 1. Purge hebdomadaire : seuls les abonnements aux notifications des PASSANTS
--    (member_id NULL, une conversation éphémère) partent au bout de 90 jours.
--    Depuis 036, elle supprimait aussi ceux des porteurs, alors qu'elle ne
--    visait que ceux des passants : un porteur cessait d'être notifié au bout
--    de 90 jours, sans le savoir. Ceux des porteurs partent avec le compte
--    (cascade), à la déconnexion (DELETE /api/push/subscribe), ou quand le
--    service de push les dit expirés (404/410 à l'envoi, lib/push-notify).
-- 2. Téléphone du porteur, relevé par le serveur à l'ouverture de « Mon
--    espace » : iPhone ou Android (rien pour un ordinateur), et première
--    ouverture de l'app installée sur l'écran d'accueil. Pour mesurer, pendant
--    le test terrain, la part des porteurs sur iPhone qui ont installé l'app.
--    Colonnes hors de l'allowlist client (042) : écrites par le serveur, lues
--    par /admin et par le porteur lui-même (get_own_member, export RGPD).

ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_os TEXT
  CHECK (phone_os IN ('ios', 'android'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS app_installed_at TIMESTAMPTZ;

COMMENT ON COLUMN members.phone_os IS
  'Téléphone de la dernière ouverture de « Mon espace » depuis un téléphone : ios ou android.';
COMMENT ON COLUMN members.app_installed_at IS
  'Première ouverture de « Mon espace » depuis l''app installée sur un téléphone (adresse de départ ?src=app).';

-- ─── Purge hebdomadaire : 058, sauf les abonnements des porteurs ─────────────
-- Même signature : CREATE OR REPLACE suffit et garde les droits, réaffirmés.
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT,
  conversations_deleted       BIGINT
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
  v_conversations    BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE
      -- Preuves de consentement / opérations RGPD : 5 ans
      (action IN ('member.marketing_consent_changed', 'member.data_exported',
                  'member.deleted', 'member.reclaimed', 'member.activated')
         AND created_at < (now() - interval '5 years'))
      OR
      -- Traces d'abus : 24 mois (le contenu, lui, est purgé avec la conversation)
      (action IN ('message.moderated', 'message.reported', 'conversation.blocked',
                  'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '24 months'))
      OR
      -- Tout le reste : 12 mois
      (action NOT IN ('member.marketing_consent_changed', 'member.data_exported',
                      'member.deleted', 'member.reclaimed', 'member.activated',
                      'message.moderated', 'message.reported', 'conversation.blocked',
                      'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '12 months'))
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

  -- Passants seulement : ceux des porteurs restent tant que l'appareil est abonné.
  WITH deleted AS (
    DELETE FROM push_subscriptions
    WHERE member_id IS NULL AND created_at < (now() - interval '90 days')
    RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  -- Conversations dont le dernier message (racine ou réponse) a plus de 12 mois.
  WITH deleted AS (
    DELETE FROM messages r
    WHERE r.parent_id IS NULL
      AND r.created_at < (now() - interval '12 months')
      AND NOT EXISTS (
        SELECT 1 FROM messages c
        WHERE c.parent_id = r.id AND c.created_at >= (now() - interval '12 months')
      )
    RETURNING r.id
  ) SELECT count(*) INTO v_conversations FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push, v_conversations;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;
