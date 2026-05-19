-- 009_rls_push_subscriptions.sql
-- Policies pour la table push_subscriptions.
-- INSERT/SELECT/DELETE passent par supabaseAdmin.

-- Le propriétaire peut voir ses subscriptions
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Le propriétaire peut supprimer ses subscriptions
CREATE POLICY push_subscriptions_delete_own ON push_subscriptions
  FOR DELETE USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les subscriptions sont insérées par supabaseAdmin
-- via /api/push/subscribe (rate limité côté applicatif).
