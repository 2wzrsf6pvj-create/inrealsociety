-- 048_order_qr_style.sql
-- Choix de la FORME du QR par le client à l'achat (feature « le client choisit »).
-- Stocké sur l'order au checkout ; lu par fulfillOrder pour générer le QR dans la
-- forme demandée. Seules des formes prouvées décodables sont acceptées (voir le
-- test qr-decode) : sharp (carrés nets) / rounded (arrondi, défaut) / soft (doux).
--
-- ADD COLUMN avec DEFAULT constant = safe sur base live (PG11+ : pas de réécriture
-- de table). Les commandes existantes prennent 'rounded' (= comportement actuel).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS qr_style TEXT NOT NULL DEFAULT 'rounded';

-- Garde-fou : seules les 3 formes offertes sont acceptées (aligné sur QR_STYLES).
-- NOT VALID puis VALIDATE pour ne pas verrouiller longuement une grande table live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_qr_style_valid'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_qr_style_valid
      CHECK (qr_style IN ('sharp', 'rounded', 'soft')) NOT VALID;
    ALTER TABLE orders VALIDATE CONSTRAINT orders_qr_style_valid;
  END IF;
END $$;
