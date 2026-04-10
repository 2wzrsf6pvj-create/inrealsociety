-- 007_rls_silent_views.sql
-- Policies pour la table silent_views.

-- Le propriétaire du membre peut voir ses vues silencieuses
CREATE POLICY silent_views_select_own ON silent_views
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les vues sont insérées par supabaseAdmin
-- via /api/silent-view (rate limité côté applicatif).
