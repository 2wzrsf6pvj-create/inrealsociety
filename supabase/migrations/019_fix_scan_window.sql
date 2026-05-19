-- 019_fix_scan_window.sql
-- Fix critique : la fenêtre de messagerie doit être basée sur le DERNIER scan,
-- pas le premier. Sinon, après 24h du tout premier scan, plus personne ne peut
-- envoyer de message au membre — jamais.
--
-- Nouveau comportement : chaque scan renouvelle la fenêtre de 24h/48h.

CREATE OR REPLACE VIEW first_scans AS
  SELECT
    member_id,
    MAX(scanned_at) AS first_scan_at  -- MAX = dernier scan (renouvelle la fenêtre)
  FROM scans
  GROUP BY member_id;
