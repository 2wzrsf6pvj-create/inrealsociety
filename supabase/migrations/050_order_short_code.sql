-- 050_order_short_code.sql
-- Découplage impression ↔ activation : on RÉSERVE le short_code du QR sur la
-- commande dès le paiement, pour pouvoir imprimer le t-shirt AVANT que l'acheteur
-- n'ait créé son profil. À l'activation, le membre HÉRITE de ce même short_code
-- (le QR déjà imprimé pointe alors vers son profil).
--
-- Contrainte : le short_code doit être unique GLOBALEMENT. Il vit dans deux
-- colonnes (members.short_code réservé aux membres activés, orders.short_code
-- réservé au moment du paiement). L'unicité inter-tables est garantie côté
-- application (generateUniqueShortCode vérifie members ET orders) ; ici on pose
-- l'unicité intra-orders + l'index de lookup pour /r/<code>.
--
-- ADD COLUMN nullable, sans DEFAULT = safe sur base live (pas de réécriture).
-- Les commandes existantes gardent short_code NULL (chemin legacy « imprimer à
-- l'activation » toujours géré par le code).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Unicité intra-orders (deux commandes ne peuvent pas réserver le même code).
-- Index partiel : n'indexe que les lignes réservées (NULL exclu).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_short_code_unique
  ON orders(short_code) WHERE short_code IS NOT NULL;
