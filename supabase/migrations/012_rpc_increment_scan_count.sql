-- 012_rpc_increment_scan_count.sql
-- Fonction RPC pour incrémenter le compteur de scans.
-- SECURITY DEFINER = s'exécute avec les privilèges du créateur (bypass RLS).

CREATE OR REPLACE FUNCTION increment_scan_count(member_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE members
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
