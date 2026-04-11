-- 016_premium.sql
-- Ajout du système d'abonnement premium sur la table members.

-- Plan : 'free' (défaut après achat t-shirt) ou 'premium' (abonnement 2.99€/mois)
ALTER TABLE members ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Index pour les lookups Stripe
CREATE INDEX IF NOT EXISTS idx_members_stripe_customer_id ON members(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_stripe_subscription_id ON members(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
