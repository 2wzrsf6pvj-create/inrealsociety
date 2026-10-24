-- 063_origine_achats.sql
-- Origine d'un achat (choix de Clément, 2026-10-24) : le porteur dont le
-- profil, vu après un scan, a mené à la commande (lien vers la boutique depuis
-- son profil ou après un message, gardé 30 jours sur l'appareil du passant,
-- cf. src/lib/scan-origin.ts). /admin compte ces achats, en tout et par
-- porteur, sans dépendre du consentement aux mesures d'audience.
--
-- Écrite par le serveur au checkout, jamais par le client (orders : RLS sans
-- politique, aucune ligne visible côté client). Effacée avec le compte du
-- porteur (ON DELETE SET NULL), et au bout de 24 mois comme les scans dont
-- elle vient (purge hebdomadaire) ; la commande, elle, reste (obligation
-- comptable).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS from_member_id UUID
  REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_from_member_id_idx
  ON orders (from_member_id) WHERE from_member_id IS NOT NULL;

COMMENT ON COLUMN orders.from_member_id IS
  'Porteur dont le profil, vu après un scan, a mené à cet achat (30 jours, même appareil). Effacé avec son compte, ou au bout de 24 mois.';

-- ─── Purge hebdomadaire : 062, plus l'origine des achats ─────────────────────
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

  -- Origine d'un achat : 24 mois, comme les scans. La commande reste.
  UPDATE orders SET from_member_id = NULL
  WHERE from_member_id IS NOT NULL AND created_at < (now() - interval '24 months');

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
