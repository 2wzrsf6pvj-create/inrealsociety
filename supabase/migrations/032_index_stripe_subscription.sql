-- 032_index_stripe_subscription.sql
-- Le webhook Stripe (handleSubscriptionChange) fait des lookups
--   members WHERE stripe_subscription_id = ?
-- mais seul stripe_customer_id était indexé (migration 016). Sans index sur
-- stripe_subscription_id, chaque event subscription.updated/deleted déclenche
-- un full table scan de members. Négligeable à 100 membres, coûteux à 100K.

CREATE INDEX IF NOT EXISTS idx_members_stripe_subscription_id
  ON members(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
