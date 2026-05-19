-- 014_rpc_create_member.sql
-- Création atomique d'un membre avec consommation du code d'activation.
-- Empêche la race condition TOCTOU : le UPDATE ... WHERE used = false
-- verrouille la ligne et échoue si le code est déjà utilisé.

CREATE OR REPLACE FUNCTION create_member_with_code(
  p_auth_user_id UUID,
  p_code         TEXT,
  p_name         TEXT,
  p_pitch        TEXT,
  p_email        TEXT DEFAULT NULL,
  p_instagram    TEXT DEFAULT NULL,
  p_short_code   TEXT DEFAULT NULL
)
RETURNS TABLE(member_id UUID, already_exists BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id UUID;
  v_existing_id UUID;
BEGIN
  -- 1. Vérifie si le user a déjà un profil
  SELECT id INTO v_existing_id
  FROM members
  WHERE auth_user_id = p_auth_user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, true, NULL::TEXT;
    RETURN;
  END IF;

  -- 2. Consomme le code d'activation atomiquement (UPDATE avec WHERE used = false)
  --    Si deux requêtes arrivent en même temps, seule la première réussit.
  UPDATE activation_codes
  SET used = true
  WHERE code = p_code AND used = false;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Code invalide ou déjà utilisé.'::TEXT;
    RETURN;
  END IF;

  -- 3. Crée le membre
  INSERT INTO members (auth_user_id, name, pitch, email, instagram, short_code)
  VALUES (p_auth_user_id, p_name, p_pitch, p_email, p_instagram, p_short_code)
  RETURNING id INTO v_member_id;

  -- 4. Lie le code au membre
  UPDATE activation_codes
  SET member_id = v_member_id
  WHERE code = p_code;

  RETURN QUERY SELECT v_member_id, false, NULL::TEXT;
END;
$$;
