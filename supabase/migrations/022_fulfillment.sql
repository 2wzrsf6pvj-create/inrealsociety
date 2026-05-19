-- 022_fulfillment.sql
-- Suivi du fulfillment Printful : permet de déclencher Printful après activation
-- (et pas seulement quand le metadata Stripe contient déjà un userId).
--
-- Idempotence : fulfillOrder() vérifie printful_order_id avant d'appeler Printful.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS printful_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_activation_code
  ON orders(activation_code)
  WHERE activation_code IS NOT NULL;
