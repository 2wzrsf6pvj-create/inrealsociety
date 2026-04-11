-- 018_scan_location.sql
-- Ajout de la géolocalisation sur les scans.
-- Stocke lat/lng bruts + le nom de lieu résolu (reverse geocoding).

ALTER TABLE scans ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS location  TEXT;  -- "Paris, 11e" résolu côté serveur
