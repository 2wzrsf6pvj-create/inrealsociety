-- 033_rls_hardening_views.sql
-- Ferme une fuite cross-membre exploitable avec la clé publique (anon).
--
-- PROBLÈME
-- Les vues member_inbox (025) et first_scans (015/019) sont des vues SANS
-- security_invoker. Sur Postgres 15+ (Supabase), une vue non-invoker s'exécute
-- avec les droits de SON PROPRIÉTAIRE (postgres = propriétaire des tables) →
-- elle BYPASSE la RLS des tables sous-jacentes (messages, scans).
-- member_inbox était de plus GRANT à `anon` (025:90). La clé anon étant publique
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), n'importe qui pouvait interroger
--   GET /rest/v1/member_inbox
-- et lire les messages racine + réponses (contenu + sender_contact) de TOUS les
-- membres. Appliquer la RLS sur `messages` ne referme PAS ça : la vue est
-- elle-même le contournement.
--
-- CORRECTIF (défense en profondeur)
--   1. security_invoker = on  → la vue applique désormais la RLS au nom de
--      l'appelant (un anon/authenticated ne verrait que ses propres lignes).
--   2. REVOKE anon, authenticated → seul service_role lit ces vues. C'est la
--      protection principale : l'app ne les lit qu'en service_role
--      (inbox.ts / queries-server.ts / api/message via supabaseAdmin), donc
--      rien ne casse. service_role bypasse la RLS → lectures admin intactes.
--
-- Idempotent : ALTER VIEW SET et REVOKE sont sûrs à ré-exécuter.

-- ─── member_inbox ────────────────────────────────────────────────────────────
ALTER VIEW member_inbox SET (security_invoker = on);
REVOKE SELECT ON member_inbox FROM anon, authenticated;

-- ─── first_scans ─────────────────────────────────────────────────────────────
-- Moins sensible (timestamps) mais même classe de contournement. Lue uniquement
-- en service_role (queries-server.getFirstScanAt, /api/message fenêtre).
ALTER VIEW first_scans SET (security_invoker = on);
REVOKE SELECT ON first_scans FROM anon, authenticated;

-- ─── NOTE : auth_user_id volontairement NON revoke pour `authenticated` ───────
-- On pourrait vouloir REVOKE SELECT (auth_user_id) ON members FROM authenticated
-- (asymétrie avec 026 qui le revoke pour anon). MAIS référencer une colonne dans
-- un WHERE exige le privilège SELECT dessus en Postgres. Or des self-lookups
-- légitimes filtrent sur auth_user_id via le client authentifié :
--   * src/app/register/page.tsx           .eq('auth_user_id', user.id)
--   * src/app/components/ui/AuthIndicator  .eq('auth_user_id', user.id)
-- Le revoke casserait ces requêtes. Le vrai correctif est le refacto allowlist
-- (policy own-row complète + policy public colonnes-publiques-seulement) que le
-- commentaire de 026 diffère déjà. À traiter dans une migration dédiée.
