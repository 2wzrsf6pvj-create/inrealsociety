-- 008_rls_referrals.sql
-- Policies pour la table referrals.

-- Le parrain peut voir ses referrals
CREATE POLICY referrals_select_own ON referrals
  FOR SELECT USING (
    referrer_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Seul le propriétaire peut insérer un referral pour son propre membre
CREATE POLICY referrals_insert_own ON referrals
  FOR INSERT WITH CHECK (
    referrer_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );
