-- 013_short_code.sql
-- Ajoute un code court unique à chaque membre pour les URLs de QR code.
-- Format : 2-6 caractères alphanumériques (ex: u8, k3f, ab12).

ALTER TABLE members ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- Index pour les redirections rapides
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_short_code
  ON members (short_code) WHERE short_code IS NOT NULL;
