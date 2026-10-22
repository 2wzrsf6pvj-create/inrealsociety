-- 058_rgpd_retention_city_only.sql
-- Lot RGPD (décisions de Clément, 2026-10-22).
--
-- 1. Conversations supprimées 12 mois après leur dernier message (promesse
--    éphémère, minimisation). Supprimer le message racine emporte les réponses
--    (parent_id ON DELETE CASCADE), les vérifications d'email (057) et les
--    signalements (056). feedback et blocks gardent leur ligne (SET NULL) : un
--    blocage survit à la conversation.
-- 2. Preuves de consentement et d'opérations RGPD : 5 ans (prescription de droit
--    commun), au lieu de « jamais purgées ».
-- 3. Traces d'abus conservées 24 mois : + device.auto_banned (056) et
--    profile.reported (signalement d'un profil).
-- 4. Géolocalisation : seule la ville est conservée. record_scan ignore les
--    coordonnées (même signature : le code déjà déployé reste compatible) ; les
--    scans existants perdent leurs coordonnées et gardent la ville
--    (« quartier, ville » → « ville »).
--
-- cleanup_old_data() change de type de retour (conversations_deleted) : DROP puis
-- CREATE. Depuis 053, une nouvelle fonction n'est exécutable par personne par
-- défaut : le droit de service_role est reposé explicitement.

-- ─── 4. Géolocalisation : la ville seulement ────────────────────────────────
CREATE OR REPLACE FUNCTION record_scan(
  p_member_id    UUID,
  p_scanner_name TEXT,
  p_latitude     DOUBLE PRECISION,
  p_longitude    DOUBLE PRECISION,
  p_location     TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_latitude / p_longitude ignorés (minimisation) : seule la ville est gardée.
  INSERT INTO scans (member_id, scanner_name, location)
  VALUES (p_member_id, p_scanner_name, p_location);

  UPDATE members
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = p_member_id;
END;
$$;

UPDATE scans SET latitude = NULL, longitude = NULL
WHERE latitude IS NOT NULL OR longitude IS NOT NULL;

-- « quartier, ville » → « ville » (le nom était construit par parts.join(', ')).
UPDATE scans SET location = regexp_replace(location, '^.*,\s*', '')
WHERE location LIKE '%,%';

-- ─── 1 à 3. Purge hebdomadaire ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS cleanup_old_data();

CREATE FUNCTION cleanup_old_data()
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

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
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
