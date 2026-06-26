-- 041_security_scan_count_and_consent.sql
-- Deux trous exploitables avec la SEULE clé anon publique (audit RLS 2026-06-26).
-- Tous deux dus à des objets ajoutés AVANT/APRÈS le durcissement RLS sans être
-- alignés dessus.

-- ─── F1. increment_scan_count : SECURITY DEFINER exposé à PUBLIC ───────────────
-- 012 a créé increment_scan_count() en SECURITY DEFINER. Postgres accorde
-- EXECUTE à PUBLIC par défaut. 034 a remplacé son usage applicatif par record_scan
-- (insert + incrément atomiques) MAIS n'a jamais droppé ni révoqué l'ancienne :
-- elle restait appelable par anon via POST /rest/v1/rpc/increment_scan_count
-- → gonflage arbitraire du scan_count de n'importe quel membre (intégrité de la
-- métrique « porteur populaire »). Plus aucun appelant applicatif → on la DROP.
DROP FUNCTION IF EXISTS increment_scan_count(UUID);

-- ─── F2. members.marketing_consent : jamais révoqué → lisible cross-membre ─────
-- 027 a ajouté marketing_consent / marketing_consent_at APRÈS les REVOKE de
-- colonnes (026 anon, 030 authenticated), qui ne les listent pas. Avec
-- members_select_public USING(true) toujours actif, n'importe qui peut lire l'état
-- de consentement marketing de TOUS les membres via la clé anon
-- (GET /rest/v1/members?select=marketing_consent,id) — fuite RGPD cross-membre.
-- Le propriétaire lit son propre consentement via get_own_member() (SECURITY
-- DEFINER, RETURNS members / SELECT *) qui bypasse ce REVOKE → aucune régression.
REVOKE SELECT (marketing_consent, marketing_consent_at) ON members FROM anon, authenticated;
