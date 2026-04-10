-- 010_rls_audit_logs.sql
-- Policies pour la table audit_logs.

-- Le propriétaire du membre peut voir ses logs d'audit
CREATE POLICY audit_logs_select_own ON audit_logs
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les logs sont insérés par le service role
-- via la fonction audit() côté serveur.
