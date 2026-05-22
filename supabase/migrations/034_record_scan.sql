-- 034_record_scan.sql
-- Enregistre un scan ET incrémente scan_count dans UNE SEULE transaction.
--
-- Avant : /api/scan faisait 2 opérations séparées (INSERT scans + RPC
-- increment_scan_count). Si l'incrément échouait (réseau, etc.), la ligne scans
-- existait mais le compteur n'était pas incrémenté → scan_count dérivait
-- durablement, sans réconciliation. Cette fonction garantit l'atomicité : soit
-- les deux réussissent, soit rien.
--
-- SECURITY DEFINER : bypass la RLS (scans est owner-only en SELECT ; les
-- écritures passent par cette fonction appelée en service_role depuis /api/scan).

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
  INSERT INTO scans (member_id, scanner_name, latitude, longitude, location)
  VALUES (p_member_id, p_scanner_name, p_latitude, p_longitude, p_location);

  UPDATE members
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = p_member_id;
END;
$$;

-- Défense en profondeur : seul service_role (via /api/scan) peut l'appeler.
REVOKE EXECUTE ON FUNCTION record_scan(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION record_scan(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;

COMMENT ON FUNCTION record_scan IS
  'Insère un scan + incrémente members.scan_count atomiquement. Remplace le
duo INSERT scans / increment_scan_count de /api/scan (qui pouvait dériver).';
