-- 019_fix_scan_window.sql
-- Fix critique : la fenêtre de messagerie doit être basée sur le DERNIER scan,
-- pas le premier. Sinon, après 24h du tout premier scan, plus personne ne peut
-- envoyer de message au membre — jamais.
--
-- Nouveau comportement : chaque scan renouvelle la fenêtre de 24h/48h.
--
-- ⚠️ DOIT s'exécuter APRÈS 015 (qui crée first_scans avec MIN). Cette migration
-- la remplace par MAX. Si seule 015 est appliquée, la fenêtre est figée au
-- premier scan = bug. L'ordre numérique des migrations garantit ça via db push.
--
-- ⚠️ NOM TROMPEUR conservé pour rétrocompat : la vue s'appelle `first_scans`
-- et la colonne `first_scan_at`, mais elles renvoient en réalité le DERNIER
-- scan (MAX). Renommer casserait getFirstScanAt() + /api/message. Le nom reste
-- historique — lire "fenêtre de référence" plutôt que "premier scan".

CREATE OR REPLACE VIEW first_scans AS
  SELECT
    member_id,
    MAX(scanned_at) AS first_scan_at  -- MAX = dernier scan (renouvelle la fenêtre)
  FROM scans
  GROUP BY member_id;
