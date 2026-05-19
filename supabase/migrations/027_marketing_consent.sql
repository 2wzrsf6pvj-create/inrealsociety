-- 027_marketing_consent.sql
-- Consentement marketing séparé du consent analytics.
-- Par défaut false (opt-in obligatoire RGPD). Mis à jour explicitement par
-- le membre via /api/member/update ou la case à cocher à l'inscription.
--
-- Le ConsentBanner gère uniquement le consent analytics (PostHog) — ce
-- consentement marketing est demandé séparément lors d'actions concernant
-- les emails non-transactionnels.

ALTER TABLE members ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN members.marketing_consent IS
  'Consentement explicite pour recevoir des emails marketing/newsletter
(RGPD art. 7). Distinct du consent analytics (cookie banner). Doit être true
AVANT toute envoi d''email marketing.';
