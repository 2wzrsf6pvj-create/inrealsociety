-- scripts/verify-migrations.sql
-- Vérifie que le lot de durcissement (033/034/035) a bien pris.
-- Usage :  psql "$DATABASE_URL" -f scripts/verify-migrations.sql
-- Ne nécessite NI auth user, NI Stripe — juste une connexion à la DB.
-- Tout doit afficher le résultat "attendu" en commentaire.

\echo '=== 033 — anon/authenticated ne doivent PLUS lire les vues (attendu: f) ==='
SELECT 'member_inbox / anon'          AS check, has_table_privilege('anon',          'member_inbox', 'SELECT') AS granted;
SELECT 'member_inbox / authenticated' AS check, has_table_privilege('authenticated', 'member_inbox', 'SELECT') AS granted;
SELECT 'first_scans  / anon'          AS check, has_table_privilege('anon',          'first_scans',  'SELECT') AS granted;

\echo '=== 033 — les vues doivent être en security_invoker=on ==='
SELECT relname, reloptions
FROM pg_class
WHERE relname IN ('member_inbox', 'first_scans');
-- attendu: reloptions contient {security_invoker=on}

\echo '=== 034 — la fonction record_scan doit exister (attendu: 1 ligne) ==='
SELECT proname, pronargs FROM pg_proc WHERE proname = 'record_scan';

\echo '=== 035 — anon/public ne doivent PLUS exécuter create_member_with_code (attendu: f) ==='
SELECT 'anon'   AS role, has_function_privilege('anon',
  'create_member_with_code(uuid,text,text,text,text,text,text)', 'EXECUTE') AS can_execute;
-- service_role DOIT pouvoir (attendu: t)
SELECT 'service_role' AS role, has_function_privilege('service_role',
  'create_member_with_code(uuid,text,text,text,text,text,text)', 'EXECUTE') AS can_execute;

\echo '=== 053 — aucune fonction SECURITY DEFINER exécutable par anon/authenticated, sauf get_own_member (attendu: 0 ligne) ==='
-- ⚠️ Tester `authenticated`, pas seulement anon : Supabase lui accorde EXECUTE
-- nominativement (default privileges) — un REVOKE FROM public ne l'enlève pas.
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND p.proname <> 'get_own_member'
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

\echo '=== 053 — get_own_member reste appelable par authenticated (attendu: t) ==='
SELECT has_function_privilege('authenticated', 'get_own_member()', 'EXECUTE') AS can_execute;

\echo '=== 053 — messages non modifiable côté client (attendu: f, f) ==='
SELECT has_table_privilege('authenticated', 'messages', 'UPDATE') AS authd_update,
       has_table_privilege('authenticated', 'messages', 'INSERT') AS authd_insert;

\echo '=== 053 — pas d''upload direct dans les buckets (attendu: 0 ligne) ==='
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('INSERT', 'UPDATE');

\echo '=== Rappel : RLS activée sur les tables sensibles (attendu: tous t) ==='
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('members', 'messages', 'scans', 'orders', 'activation_codes')
ORDER BY relname;
