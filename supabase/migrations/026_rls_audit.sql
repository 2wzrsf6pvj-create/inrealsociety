-- 026_rls_audit.sql
-- Fermeture de deux failles RLS identifiées en audit avant prod.
--
-- 1. qrcodes_insert_auth : permettait à tout user authentifié d'uploader dans
--    n'importe quel path du bucket qrcodes. Risque : un attaquant écrase le QR
--    code d'un autre membre, rendant son t-shirt inutilisable ou redirigeant
--    vers un profil malicieux.
--
-- 2. members.email + stripe_customer_id + stripe_subscription_id +
--    plan_expires_at exposés via members_select_public (USING true). Un user
--    anon peut SELECT ces colonnes pour tous les profils → fuite GDPR.
--    On revoke les column-level grants sur anon (l'attaque via le client JS
--    public devient impossible) et on documente le pattern pour le owner via
--    API routes (qui utilisent supabaseAdmin = bypass RLS).

-- ─── 1. Fix qrcodes_insert : restreindre au folder du propriétaire ──────────
DROP POLICY IF EXISTS qrcodes_insert_auth ON storage.objects;

CREATE POLICY qrcodes_insert_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'qrcodes'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- UPDATE policy parallèle (pour upsert avec replace) — auparavant absente,
-- ce qui empêchait les utilisateurs de mettre à jour leur propre QR.
CREATE POLICY qrcodes_update_own ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'qrcodes'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- ─── 2. Fix members.email exposure : revoke column-level pour anon ──────────
-- Le rôle anon (utilisé par le client JS public via NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- ne peut plus SELECT email ni les identifiants Stripe. Les helpers serveur
-- qui ont besoin de ces colonnes utilisent supabaseAdmin (service_role,
-- bypass RLS et bypass column grants).
--
-- Note : on garde authenticated avec SELECT complet car :
--   * Le dashboard SSR utilise le cookie auth → role 'authenticated'
--   * Le membre voit son propre email via le RLS members_select_public + RLS
--     row-level fait son job (mais la policy actuelle USING(true) ne filtre pas)
--   * Risque résiduel : un user authentifié peut toujours SELECT email d'autres
--     membres via le client browser. Pour éliminer ça complètement, il faudrait
--     refondre members_select_public en deux policies (own + public_columns_only)
--     ce qui nécessite des refacto helpers — reporté à une migration future.

REVOKE SELECT (email, stripe_customer_id, stripe_subscription_id, plan_expires_at, auth_user_id)
  ON members FROM anon;

-- ─── 3. Documentation de l'héritage RLS de member_inbox ─────────────────────
-- La vue créée en migration 025 hérite la RLS des tables sources (messages).
-- Postgres applique automatiquement les policies de SELECT sur messages quand
-- la vue est interrogée — donc l'utilisateur ne voit que ses propres top-level
-- messages et leurs replies thread.

COMMENT ON VIEW member_inbox IS
  'Inbox des messages racine avec statut de réponse dérivé du thread.
Héritage RLS automatique depuis messages.messages_select_own
(member_id filtré par auth_user_id). Un user authentifié ne voit
que ses propres conversations, le LATERAL JOIN aux replies thread
applique la même policy.';
