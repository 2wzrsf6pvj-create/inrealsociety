-- 049_order_tagline.sql
-- Accroche imprimée SOUS le QR au dos du t-shirt : le hameçon qui donne une raison de
-- scanner. Le client la CHOISIT dans une bibliothèque fermée (src/lib/taglines.ts) ;
-- jamais de texte libre (aucune modération, aucun risque juridique sur un objet physique).
-- Stockée sur l'order au checkout, lue par fulfillOrder pour composer le fichier dos.
--
-- NULL = « QR seul » (option assumée). Pas de DEFAULT : l'absence de choix = pas d'accroche.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tagline_id TEXT;

-- On NE met PAS de contrainte CHECK sur les id : la whitelist vit dans le code
-- (isValidTaglineId, src/lib/taglines.ts) et évolue avec la bibliothèque, sans migration.
-- La validation serveur (checkout / member-create) refuse tout id hors bibliothèque ;
-- un id inconnu au fulfillment retombe proprement sur « QR seul » (getTagline → null).
COMMENT ON COLUMN orders.tagline_id IS
  'Slug d''accroche imprimée sous le QR (src/lib/taglines.ts). NULL = QR seul. Whitelist côté code.';
