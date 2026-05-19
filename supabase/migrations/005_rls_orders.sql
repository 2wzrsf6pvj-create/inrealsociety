-- 005_rls_orders.sql
-- Policies pour la table orders.

-- Le propriétaire peut voir ses commandes (via email match)
CREATE POLICY orders_select_own ON orders
  FOR SELECT USING (
    email = (
      SELECT email FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT/UPDATE : tout passe par supabaseAdmin
-- (webhook Stripe pour les mises à jour, checkout pour la création).
