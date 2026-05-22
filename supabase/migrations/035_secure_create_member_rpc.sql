-- 035_secure_create_member_rpc.sql
-- FAILLE : create_member_with_code (014) est SECURITY DEFINER mais n'avait aucun
-- REVOKE → Postgres accorde EXECUTE à PUBLIC par défaut. N'importe quel client
-- avec la clé anon publique pouvait l'appeler en direct (POST /rest/v1/rpc/...),
-- contournant requireAuth. Pire : p_auth_user_id est un PARAMÈTRE (pas auth.uid()),
-- donc on pouvait créer un membre lié à n'importe quel compte + brûler des codes.
--
-- Correctif : seul service_role (utilisé par /api/member/create, qui a déjà fait
-- requireAuth et passe l'auth.user.id vérifié) peut exécuter la fonction.
-- service_role n'a pas d'auth.uid() → garder p_auth_user_id en paramètre est
-- correct DÈS LORS que seul le backend de confiance peut appeler.
--
-- (Aligne create_member_with_code sur get_own_member (030) et record_scan (034).)

REVOKE EXECUTE ON FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Hygiène : search_path figé (manquait, contrairement à 030/034).
ALTER FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) SET search_path = public;
