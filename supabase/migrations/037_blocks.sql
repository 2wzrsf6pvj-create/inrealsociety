-- 037_blocks.sql
-- Sécurité « grade produit » : permet à un porteur de bloquer un scanneur.
--
-- Contexte : le scanneur est anonyme (pas de compte). Pour qu'un blocage ait du
-- sens au-delà d'une seule conversation, on s'appuie sur un jeton de device
-- pseudonyme (cookie httpOnly `irs_sender`, posé côté scanneur lors de son
-- premier message — voir src/lib/sender-token.ts). Base légale : intérêt
-- légitime (art. 6.1.f RGPD), anti-harcèlement. Aucun usage analytics.
--
-- Deux niveaux :
--   * messages.blocked_at  → cette conversation est close (plus aucun message)
--   * table blocks         → ce device ne peut plus rouvrir de conv ni répondre
--                            à ce porteur (quand un sender_token est connu)
--
-- Limite assumée : effacer ses cookies / navigation privée réinitialise le
-- jeton. Le blocage relève la barre, il n'est pas infaillible (anonymat oblige).
-- Idempotent : safe à rejouer.

-- ─── 1. Colonnes sur messages (uniquement pertinentes sur le message racine) ──
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_token TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS blocked_at   TIMESTAMPTZ;

-- Retrouver les conversations d'un device pour un porteur donné.
CREATE INDEX IF NOT EXISTS idx_messages_sender_token
  ON messages(member_id, sender_token)
  WHERE sender_token IS NOT NULL;

-- ─── 2. Table blocks : (porteur, jeton device) ───────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  sender_token TEXT NOT NULL,
  message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,  -- conv d'origine
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, sender_token)
);

-- La contrainte UNIQUE crée déjà l'index (member_id, sender_token) utilisé par
-- le check de blocage côté /api/message et /api/conversation/reply.

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
-- Toutes les écritures passent par supabaseAdmin (service_role bypass RLS).
-- On expose seulement une lecture owner-only au cas où un jour la dashboard
-- lirait la table côté client. Pas de policy INSERT/UPDATE/DELETE → anon et
-- authenticated ne peuvent pas écrire.
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocks_select_own ON blocks;
CREATE POLICY blocks_select_own ON blocks
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Le jeton de device est une donnée de sécurité : jamais lisible par anon.
REVOKE ALL ON blocks FROM anon;
GRANT SELECT ON blocks TO authenticated;
GRANT ALL    ON blocks TO service_role;

COMMENT ON TABLE blocks IS
'Blocages porteur → device scanneur (sender_token pseudonyme). Intérêt légitime
anti-harcèlement (art. 6.1.f RGPD). Purgé en cascade avec le membre.';
