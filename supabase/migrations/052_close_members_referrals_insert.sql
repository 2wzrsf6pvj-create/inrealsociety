-- 052_close_members_referrals_insert.sql
-- 🔴 FAILLE (revue 2026-07-17) : bypass du paywall + auto-octroi du premium.
--
-- La passe de durcissement a fermé le SELECT (042) et l'UPDATE (045) sur `members`,
-- mais JAMAIS l'INSERT. La policy `members_insert_own` (002) est restée vivante et
-- le rôle `authenticated` garde le GRANT INSERT par défaut de Supabase. Résultat :
-- un utilisateur avec une simple session auth (OTP email, SANS achat) peut poster
-- directement sur PostgREST, en contournant TOUTES les gardes Next.js :
--   POST /rest/v1/members
--   { "auth_user_id":"<son uid>", "name":"x", "pitch":"y", "plan":"premium",
--     "short_code":"squat" }
-- WITH CHECK (auth.uid() = auth_user_id) passe, le GRANT INSERT est présent → ligne
-- créée. Ça contourne : la consommation du code d'activation (le paywall du t-shirt),
-- le paiement Stripe du premium (`plan` en écriture libre), et la capture du
-- consentement CGV/service_waiver. Exactement l'escalade que 045 a fermée pour
-- l'UPDATE, laissée ouverte pour l'INSERT (le cas « pas encore de membre » = ceux
-- qui n'ont pas payé).
--
-- Idem `referrals` (008) : `referrals_insert_own` + GRANT INSERT laissent gonfler
-- son compteur de parrainage en contournant l'anti-fraude serveur.
--
-- MODÈLE VOULU : members/referrals ne sont écrits QUE par le backend (service_role
-- via supabaseAdmin / RPC SECURITY DEFINER `create_member_with_code`). L'app n'y
-- insère JAMAIS côté client (vérifié). On aligne le GRANT sur ce modèle.
-- REVOKE FROM anon, authenticated ne touche PAS service_role → aucun flux cassé.

-- ── members ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS members_insert_own ON members;
REVOKE INSERT, DELETE ON members FROM anon, authenticated;

-- ── referrals ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS referrals_insert_own ON referrals;
REVOKE INSERT, DELETE ON referrals FROM anon, authenticated;
