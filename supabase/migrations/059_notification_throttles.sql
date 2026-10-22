-- 059_notification_throttles.sql
-- Choix de Clément (2026-10-22), expérience du porteur :
--   * email de nouveau scan : au premier scan de la journée seulement (heure de
--     Paris). À une soirée, un porteur recevait un email par téléphone qui le
--     scannait ; le tableau de bord montre tous les scans.
--   * plafond gratuit atteint (3 conversations sur 7 jours) : le porteur est
--     prévenu par email quand quelqu'un n'a pas pu lui écrire, une fois par
--     semaine au plus.
-- Réservation atomique (UPDATE … WHERE … puis FOUND) : deux requêtes simultanées
-- n'envoient qu'un email. Colonnes hors de l'allowlist client (042) : invisibles
-- pour anon et authenticated.

ALTER TABLE members ADD COLUMN IF NOT EXISTS scan_email_on DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS cap_email_at  TIMESTAMPTZ;

COMMENT ON COLUMN members.scan_email_on IS
  'Jour (heure de Paris) du dernier email « nouveau scan » : un par jour au plus.';
COMMENT ON COLUMN members.cap_email_at IS
  'Dernier email « plafond atteint, quelqu''un n''a pas pu vous écrire » : un par semaine au plus.';

-- true si l'email du jour est réservé pour ce porteur (aucun encore aujourd'hui).
CREATE OR REPLACE FUNCTION claim_scan_email(p_member_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET scan_email_on = (now() AT TIME ZONE 'Europe/Paris')::date
  WHERE id = p_member_id
    AND (scan_email_on IS NULL OR scan_email_on < (now() AT TIME ZONE 'Europe/Paris')::date);
  RETURN FOUND;
END;
$$;

-- true si l'email « plafond atteint » est réservé (aucun depuis 7 jours).
CREATE OR REPLACE FUNCTION claim_cap_email(p_member_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET cap_email_at = now()
  WHERE id = p_member_id
    AND (cap_email_at IS NULL OR cap_email_at < now() - interval '7 days');
  RETURN FOUND;
END;
$$;

-- Backend uniquement (cf. 053 : rien n'est exécutable par défaut).
REVOKE EXECUTE ON FUNCTION claim_scan_email(UUID) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION claim_cap_email(UUID)  FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION claim_scan_email(UUID) TO service_role;
GRANT  EXECUTE ON FUNCTION claim_cap_email(UUID)  TO service_role;
