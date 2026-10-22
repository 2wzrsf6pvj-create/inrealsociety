-- 055_order_activation_reminders.sql
-- Relance des acheteurs qui ont payé mais n'ont jamais activé leur profil.
--
-- Depuis l'impression au paiement (050), le t-shirt part même sans activation :
-- chaque scan tombe alors sur « pas encore activé ». La relance existante (044)
-- ne vise que les COMPTES créés sans profil ; un acheteur qui n'a jamais créé de
-- compte n'était relancé par personne.
--
-- /api/cron/activation-reminder envoie au plus 2 relances par commande (J+2, J+7 —
-- règle dans src/lib/order-reminders.ts) et les compte ici.
--
-- ADD COLUMN avec DEFAULT constant = safe sur base live (pas de réécriture, PG ≥ 11).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS activation_reminders_sent SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS activation_reminder_at TIMESTAMPTZ;

-- Candidats du cron : commandes payées, pas encore relancées 2 fois.
CREATE INDEX IF NOT EXISTS idx_orders_activation_reminder
  ON orders (created_at)
  WHERE status = 'paid' AND activation_reminders_sent < 2;

COMMENT ON COLUMN orders.activation_reminders_sent IS
  'Relances « activez votre profil » envoyées (max 2, cf. src/lib/order-reminders.ts).';
