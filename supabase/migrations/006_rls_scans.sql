-- 006_rls_scans.sql
-- Policies pour la table scans.

-- Le propriétaire du membre peut voir ses scans
CREATE POLICY scans_select_own ON scans
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les scans sont insérés par supabaseAdmin
-- via /api/scan (rate limité côté applicatif).
