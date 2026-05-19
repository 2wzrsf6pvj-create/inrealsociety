-- 028_newsletter.sql
-- Capture des emails newsletter (visiteurs non-acheteurs).
-- RGPD : consentement explicite via le formulaire opt-in, horodaté à la
-- création. Désinscription via lien dans l'email (à câbler quand on enverra
-- une vraie newsletter).

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  source      TEXT,                              -- ex: 'shop_inline', 'manifesto_cta'
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  ip          TEXT,                              -- preuve de consentement (RGPD)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Aucune policy : accessible UNIQUEMENT via service_role (route /api/newsletter
-- via supabaseAdmin). Les visiteurs anon ne peuvent ni lire ni modifier.

COMMENT ON TABLE newsletter_subscribers IS
  'Inscrits newsletter (capture leads pré-achat). RGPD : preuve de consentement
via consented_at + ip stockés à l''inscription. Désinscription en marquant
unsubscribed_at (soft delete) — purge effective via cron après 24 mois.';
