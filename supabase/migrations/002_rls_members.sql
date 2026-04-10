-- 002_rls_members.sql
-- Policies pour la table members.

-- Tout le monde peut lire les profils (pages publiques)
CREATE POLICY members_select_public ON members
  FOR SELECT USING (true);

-- Seul le propriétaire peut créer son profil
CREATE POLICY members_insert_own ON members
  FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- Seul le propriétaire peut modifier son profil
CREATE POLICY members_update_own ON members
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);
