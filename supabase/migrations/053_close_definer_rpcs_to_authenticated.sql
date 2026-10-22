-- 053_close_definer_rpcs_to_authenticated.sql
-- 🔴 FAILLE (revue 2026-10-22) : les fonctions SECURITY DEFINER restaient
-- exécutables par `authenticated` — n'importe quelle session issue d'un simple
-- signup, sans achat.
--
-- Cause : 034/035/036/040/044/045/046 font `REVOKE EXECUTE … FROM anon, public`.
-- Or Supabase pose des DEFAULT PRIVILEGES sur le schéma public qui accordent
-- EXECUTE EXPLICITEMENT à anon ET authenticated : retirer PUBLIC n'enlève pas ce
-- grant nominatif. Même famille que 052 (INSERT members resté ouvert).
--
-- Vérifié sur une base migrée 001→052 (rôle authenticated, POST /rest/v1/rpc/…) :
--   * accounts_pending_profile() → liste les emails d'autres clients (fuite RGPD).
--   * create_member_with_code(…) → profil avec short_code ET email ARBITRAIRES :
--     vol du short_code réservé sur la commande d'un autre acheteur (son tee
--     imprimé pointe alors vers le profil de l'attaquant, et son activation
--     échoue sur l'index unique) ; contourne aussi la capture du consentement.
--   * record_scan(…) → scans forgés en masse sur n'importe quel membre
--     (scan_count, faux lieux, réouverture de la fenêtre de messages).
--   * cleanup_old_data() → purge déclenchable par n'importe qui.
--
-- MODÈLE VOULU : ces fonctions ne sont appelées QUE par le backend (service_role
-- via supabaseAdmin). Seule get_own_member() est destinée au client (030).
-- REVOKE … FROM anon, authenticated ne touche PAS service_role → aucun flux cassé.

-- ── 1. RPC SECURITY DEFINER : backend uniquement ─────────────────────────────
REVOKE EXECUTE ON FUNCTION record_scan(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION accounts_pending_profile() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION record_scan(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION accounts_pending_profile() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_data() TO service_role;

-- ── 2. Fail-safe : les FUTURES fonctions ne sont plus exécutables par défaut ──
-- Même logique que 042 pour les colonnes (allowlist plutôt que blocklist). Une
-- fonction destinée au client devra être GRANT explicitement (cf. get_own_member).
-- La révocation PUBLIC doit être GLOBALE : une révocation par schéma ne peut pas
-- retirer un privilège accordé globalement (doc ALTER DEFAULT PRIVILEGES).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM public;

-- ── 3. messages : écrit UNIQUEMENT par le backend ────────────────────────────
-- messages_update_own (003) laissait le porteur réécrire n'importe quelle colonne
-- de ses messages via PostgREST : le texte du scanneur (qu'il relit dans le fil),
-- sender_token (désactive le verrou « appareil d'origine »), moderated… L'app ne
-- modifie jamais messages côté client (mark-read, blocage, etc. passent par l'API).
-- SELECT conservé : RLS owner-only + postgres_changes du ConversationClient.
DROP POLICY IF EXISTS messages_update_own ON messages;
REVOKE INSERT, UPDATE, DELETE ON messages FROM anon, authenticated;

-- ── 4. orders : policy morte ─────────────────────────────────────────────────
-- orders_select_own lit members.email, colonne retirée à authenticated par 042 →
-- toute lecture renvoie « permission denied for table members ». Aucun code ne lit
-- orders avec une session utilisateur (tout passe par supabaseAdmin). On la retire
-- plutôt que de laisser une policy fondée sur un email désormais non fiable.
DROP POLICY IF EXISTS orders_select_own ON orders;

-- ── 5. Storage : uploads backend uniquement ──────────────────────────────────
-- /api/member/avatar (vérification du type réel + taille) et fulfillOrder
-- uploadent via service_role. Les policies d'INSERT/UPDATE directes laissaient un
-- membre déposer n'importe quel fichier (type, taille) dans son dossier des buckets
-- publics, en contournant ces contrôles. Les lectures publiques restent.
DROP POLICY IF EXISTS avatars_insert_own  ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own  ON storage.objects;
DROP POLICY IF EXISTS qrcodes_insert_own  ON storage.objects;
DROP POLICY IF EXISTS qrcodes_update_own  ON storage.objects;
DROP POLICY IF EXISTS qrcodes_insert_auth ON storage.objects;
