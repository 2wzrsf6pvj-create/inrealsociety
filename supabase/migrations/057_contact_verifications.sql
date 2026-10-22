-- 057_contact_verifications.sql
-- Vérification de l'email laissé par un passant (double opt-in).
--
-- Avant : quand le porteur répondait, la réponse partait par email à l'adresse
-- saisie par le passant, vérifiée ou non. Un passant pouvait taper l'adresse d'un
-- tiers, qui recevait alors les mots du porteur et le lien de la conversation.
-- Désormais /api/message envoie un lien de confirmation à cette adresse, et les
-- réponses n'y partent qu'une fois l'adresse confirmée.
--
-- Une ligne par message racine. Le jeton n'est jamais stocké en clair : seul son
-- SHA-256 l'est. Supprimée avec le message (purge des conversations).

CREATE TABLE IF NOT EXISTS contact_verifications (
  message_id  UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,                 -- en minuscules
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

-- Aucun accès anon/authenticated : seul service_role (supabaseAdmin) lit/écrit.
ALTER TABLE contact_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contact_verifications FROM anon, authenticated;
