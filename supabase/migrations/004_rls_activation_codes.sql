-- 004_rls_activation_codes.sql
-- Aucune policy anon : tout passe par supabaseAdmin (service role).
-- La table est verrouillée par RLS sans policy = inaccessible au client anon.

-- Pas de policy SELECT, INSERT, UPDATE, DELETE.
-- Seul le service role (supabaseAdmin) peut interagir avec cette table.
