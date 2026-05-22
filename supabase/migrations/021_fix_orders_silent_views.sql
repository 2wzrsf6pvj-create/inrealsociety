-- 021_fix_orders_silent_views.sql
-- Aligne le schéma avec le code.

-- orders.amount : le code envoie maintenant 4900 (centimes).
-- ⚠️ La colonne `amount` n'est créée qu'en 031. Sur une base NEUVE appliquée
-- dans l'ordre, un ALTER COLUMN direct planterait ici (la colonne n'existe pas
-- encore) → on n'atteindrait jamais 031. On guarde donc le SET DEFAULT : no-op
-- tant que la colonne n'existe pas (031 la créera avec DEFAULT 4900), et sur une
-- base existante où elle existe déjà, on (ré)applique le default. Idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount'
  ) THEN
    ALTER TABLE orders ALTER COLUMN amount SET DEFAULT 4900;
  END IF;
END $$;

-- silent_views : la colonne timestamp s'appelle viewed_at en base.
-- Le code n'écrit que member_id + scanner_name, viewed_at est géré par DEFAULT now().
-- Pas de changement nécessaire — tout est cohérent.
