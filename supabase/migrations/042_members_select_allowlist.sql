-- 042_members_select_allowlist.sql
-- Refonte de la lecture de `members` : BLOCKLIST → ALLOWLIST (dette F4, audit 2026-06).
--
-- Avant : policy members_select_public USING(true) (002) + REVOKE des colonnes
-- sensibles au coup par coup (026 anon, 030 authenticated, 041 marketing_consent).
-- Défaut STRUCTUREL : toute NOUVELLE colonne de `members` est exposée par défaut
-- tant qu'on n'ajoute pas un REVOKE — c'est exactement ce qui a produit la fuite
-- de marketing_consent (ajoutée en 027, jamais révoquée, corrigée en 041).
--
-- On bascule en ALLOWLIST : REVOKE tout, puis GRANT uniquement les colonnes
-- publiques. Une colonne ajoutée plus tard n'est PAS lisible par anon/authenticated
-- tant qu'on ne l'ajoute pas explicitement → fail-safe (la sécurité par défaut).
--
-- La policy RLS members_select_public USING(true) (row-level) reste inchangée :
-- les profils publics doivent être lisibles par tous. Le contrôle de COLONNES se
-- fait au niveau des GRANT, pas de la RLS (la RLS est row-level, pas column-level).
--
-- Périmètre des lectures (vérifié) :
--   anon          : getPublicMember (/profil/[id]), join/[code] (name) — colonnes
--                   strictement publiques.
--   authenticated : idem + auth_user_id, REQUIS par les filtres .eq('auth_user_id',
--                   auth.uid()) côté client (register, AuthIndicator) et l'embed
--                   conversation/[messageId]. Le owner lit email/stripe_*/consent
--                   via get_own_member() (SECURITY DEFINER → bypasse ces GRANT),
--                   donc AUCUNE colonne sensible n'a besoin d'être exposée ici.
--   service_role  : sitemap, member/export, toutes les routes API → bypass total.
--
-- Note F3 (assumée) : auth_user_id reste lisible par authenticated pour TOUTES les
-- lignes (les filtres client n'en lisent que la leur, mais le GRANT est table-wide).
-- Restreindre à la seule ligne du membre imposerait de router ces lectures via une
-- fonction SECURITY DEFINER (refonte client) — différé. Donnée à faible sensibilité
-- (mapping UUID interne, sans email associé puisque email reste révoqué).

REVOKE SELECT ON members FROM anon, authenticated;

GRANT SELECT (
  id, name, pitch, instagram, photo_url, scan_count,
  is_paused, require_contact, plan, created_at, updated_at
) ON members TO anon;

GRANT SELECT (
  id, name, pitch, instagram, photo_url, scan_count,
  is_paused, require_contact, plan, created_at, updated_at,
  auth_user_id
) ON members TO authenticated;

-- Vérif staging : en clé anon, `SELECT email FROM members` et
-- `SELECT marketing_consent FROM members` doivent renvoyer "permission denied for
-- column". `SELECT id,name,plan FROM members` doit fonctionner.
