-- 021_fix_orders_silent_views.sql
-- Aligne le schéma avec le code.

-- orders.amount : le code envoie maintenant 4900 (centimes).
-- Si la colonne n'a pas de default, on en ajoute un par sécurité.
ALTER TABLE orders ALTER COLUMN amount SET DEFAULT 4900;

-- silent_views : la colonne timestamp s'appelle viewed_at en base.
-- Le code n'écrit que member_id + scanner_name, viewed_at est géré par DEFAULT now().
-- Pas de changement nécessaire — tout est cohérent.
