-- 043_newsletter_campaigns.sql
-- Suivi + idempotence des envois de newsletter (POST /api/newsletter/send, protégé
-- par INTERNAL_SECRET). L'envoi marketing n'existait pas encore : la capture et la
-- désinscription signée étaient prêtes, il manquait le chemin d'envoi.
--
-- `key` = slug fourni par l'opérateur. sent_at est posé AU DÉBUT de l'envoi (claim)
-- → sémantique « au plus une fois » : un POST rejoué après un crash ne ré-envoie
-- PAS (ne pas spammer prime sur garantir la livraison ; les manqués → nouvelle key).

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  subject     TEXT NOT NULL,
  recipients  INTEGER NOT NULL DEFAULT 0,
  failures    INTEGER NOT NULL DEFAULT 0,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verrouillé service_role uniquement (RLS activée, aucune policy) — comme
-- newsletter_subscribers / activation_codes.
ALTER TABLE newsletter_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON newsletter_campaigns FROM anon, authenticated;
