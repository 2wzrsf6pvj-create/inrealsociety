-- 060_referral_code.sql
-- Choix de Clément (2026-10-22) : le lien de parrainage ne contient plus
-- l'identifiant du profil. /join/<id> donnait l'adresse directe du profil
-- (/profil/<id>), sans passer par le t-shirt, alors que les profils ne doivent se
-- trouver qu'en scannant. Chaque membre reçoit un code dédié, résolu côté serveur
-- seulement (colonne hors de l'allowlist client de la 042). Les liens déjà
-- partagés (/join/<uuid>) continuent de donner la remise.

-- 10 caractères de l'alphabet des codes QR (sans 0, 1, i, l, o) : ≈ 6·10^14 codes.
-- Pas un secret : le code est fait pour être partagé ; il ne doit juste pas
-- révéler l'identifiant du profil.
CREATE OR REPLACE FUNCTION gen_referral_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz2345678', 1 + floor(random() * 30)::int, 1), '')
  FROM generate_series(1, 10);
$$;

-- La colonne existe depuis 015 (TEXT UNIQUE) mais n'a jamais été remplie ni lue
-- par l'application : défaut posé ici, et tout code absent ou hors format
-- (re)généré, ligne par ligne.
ALTER TABLE members ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE members ALTER COLUMN referral_code SET DEFAULT gen_referral_code();
UPDATE members SET referral_code = gen_referral_code()
WHERE referral_code IS NULL OR referral_code !~ '^[a-hjkmnp-z2-8]{10}$';
ALTER TABLE members ALTER COLUMN referral_code SET NOT NULL;
-- Unicité : déjà assurée par la contrainte de 015 (members_referral_code_key).
CREATE UNIQUE INDEX IF NOT EXISTS members_referral_code_key ON members (referral_code);

COMMENT ON COLUMN members.referral_code IS
  'Code du lien de parrainage /join/<code> (remplace l''identifiant du profil dans le lien).';

-- Le défaut s'évalue avec les droits de qui insère : service_role (backend) et
-- les fonctions SECURITY DEFINER. Rien pour anon / authenticated (cf. 053).
REVOKE EXECUTE ON FUNCTION gen_referral_code() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION gen_referral_code() TO service_role;
