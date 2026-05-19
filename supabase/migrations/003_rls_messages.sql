-- 003_rls_messages.sql
-- Policies pour la table messages.
-- INSERT bloqué pour le client anon — toutes les insertions passent par supabaseAdmin.

-- Le propriétaire du membre peut voir ses messages
CREATE POLICY messages_select_own ON messages
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Le propriétaire peut modifier ses messages (reply, starred, read_at)
CREATE POLICY messages_update_own ON messages
  FOR UPDATE
  USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les messages sont insérés par supabaseAdmin
-- via /api/message (rate limité côté applicatif).
