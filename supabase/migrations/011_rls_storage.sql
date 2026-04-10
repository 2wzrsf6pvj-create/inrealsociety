-- 011_rls_storage.sql
-- Policies Storage pour les buckets avatars et qrcodes.

-- ─── Bucket avatars ──────────────────────────────────────────────────────────

-- Tout le monde peut lire les avatars
CREATE POLICY avatars_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Seul le propriétaire peut uploader son avatar
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Seul le propriétaire peut modifier son avatar
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- ─── Bucket qrcodes ─────────────────────────────────────────────────────────

-- Tout le monde peut lire les QR codes
CREATE POLICY qrcodes_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'qrcodes');

-- Seuls les utilisateurs authentifiés peuvent uploader
CREATE POLICY qrcodes_insert_auth ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'qrcodes'
    AND auth.role() = 'authenticated'
  );
