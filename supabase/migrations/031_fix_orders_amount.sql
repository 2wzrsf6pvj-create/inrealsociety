-- 031_fix_orders_amount.sql
-- Fix : la colonne orders.amount est référencée par /api/shop/checkout
-- (INSERT amount: 4900) et par la migration 021 (ALTER COLUMN amount SET DEFAULT),
-- mais elle n'a JAMAIS été créée — ni dans le CREATE TABLE de 015, ni via un
-- ADD COLUMN. Conséquence :
--   * migration 021 échoue (ALTER COLUMN sur colonne inexistante)
--   * l'INSERT du shop checkout échoue ("column amount does not exist")
--
-- Cette migration crée la colonne de façon idempotente. amount en centimes
-- (4900 = 49€). Source de vérité du prix = Stripe ; cette colonne sert au
-- reporting interne et au matching.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount INTEGER NOT NULL DEFAULT 4900;
