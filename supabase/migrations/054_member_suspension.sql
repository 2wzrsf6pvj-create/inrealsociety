-- 054_member_suspension.sql
-- Suspension d'un profil par l'opérateur, que le porteur ne peut PAS lever.
--
-- Cas d'usage : remboursement TOTAL d'une commande dont le code a déjà activé le
-- profil (webhook charge.refunded). Avant, le profil restait actif et le QR
-- fonctionnait ; la simple pause (is_paused) ne suffit pas, le porteur la lève
-- lui-même dans Réglages.
--
-- Modèle : suspendre = suspended_at posé ET is_paused forcé à true. Toutes les
-- vérifications existantes (profil public, scan, message, sitemap, relances)
-- lisent déjà is_paused → aucune n'a besoin de connaître la suspension.
-- /api/member/update refuse de lever la pause d'un profil suspendu ; la contrainte
-- ci-dessous le garantit en base, même si un futur chemin l'oubliait.
--
-- Lever une suspension (support, SQL Editor) :
--   UPDATE members SET suspended_at = NULL, is_paused = false WHERE id = '<uuid>';
--
-- ADD COLUMN nullable sans DEFAULT = safe sur base live. Non exposée à anon /
-- authenticated (allowlist de colonnes, 042) : un scanneur voit « indisponible »,
-- jamais la raison.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_suspended_implies_paused'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_suspended_implies_paused
      CHECK (suspended_at IS NULL OR is_paused);
  END IF;
END $$;

COMMENT ON COLUMN members.suspended_at IS
  'Suspension opérateur (ex. remboursement après activation). Implique is_paused ; non levable par le porteur.';
