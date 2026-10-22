-- 061_scan_email_opt_out.sql
-- Choix de Clément (2026-10-22), délivrabilité des emails : le porteur peut
-- couper l'email « nouveau scan », dans ses réglages ou par le lien en un clic
-- de l'email (List-Unsubscribe). Sans ce moyen, un porteur lassé n'avait que
-- « Signaler comme spam », qui pèse sur la réputation de tous nos emails,
-- codes d'activation compris.
-- Colonne hors de l'allowlist client (042) : lue et écrite par le serveur seul.

ALTER TABLE members ADD COLUMN IF NOT EXISTS scan_emails BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN members.scan_emails IS
  'Email « nouveau scan » (un par jour au plus, 059) : false = coupé par le porteur.';

-- La réservation du jour (059) échoue si le porteur a coupé ces emails : la
-- route de scan n'a rien d'autre à vérifier.
CREATE OR REPLACE FUNCTION claim_scan_email(p_member_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET scan_email_on = (now() AT TIME ZONE 'Europe/Paris')::date
  WHERE id = p_member_id
    AND scan_emails
    AND (scan_email_on IS NULL OR scan_email_on < (now() AT TIME ZONE 'Europe/Paris')::date);
  RETURN FOUND;
END;
$$;

-- CREATE OR REPLACE garde les droits de 059 ; réaffirmés : backend seulement.
REVOKE EXECUTE ON FUNCTION claim_scan_email(UUID) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION claim_scan_email(UUID) TO service_role;
