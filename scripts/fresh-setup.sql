-- fresh-setup.sql — INSTALLATION D'UNE BASE NEUVE (Option A)
-- GÉNÉRÉ par scripts/build-fresh-setup.mjs (63 migrations) — ne pas éditer à la main.
-- Ordre CORRIGÉ : 015 (schéma) EN PREMIER — 001-014 posent la RLS sur des tables
-- créées en 015, donc un ordre 001→063 naïf échoue ("table members n'existe pas").
--
-- USAGE : projet Supabase NEUF (auth + storage + rôles anon/authenticated/service_role
-- déjà présents). Coller TOUT dans le SQL Editor → Run. IF NOT EXISTS partout.


-- ═══════════════════════════════════════════════════════════════
-- ▶ 015_schema_complet.sql
-- ═══════════════════════════════════════════════════════════════
-- 015_schema_complet.sql
-- Migration idempotente : crée les tables, colonnes, vues et buckets
-- manquants. Safe à exécuter même si la structure existe déjà en prod.
-- Source de vérité du schéma complet du projet In Real Society.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  pitch         TEXT NOT NULL DEFAULT '',
  email         TEXT,
  instagram     TEXT,
  photo_url     TEXT,
  scan_count    INTEGER NOT NULL DEFAULT 0,
  is_paused     BOOLEAN NOT NULL DEFAULT false,
  short_code    TEXT UNIQUE,
  referral_code TEXT UNIQUE,
  qr_code_url   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonnes ajoutées après la création initiale (idempotent)
ALTER TABLE members ADD COLUMN IF NOT EXISTS short_code    TEXT UNIQUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS qr_code_url   TEXT;

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON members(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_members_short_code   ON members(short_code) WHERE short_code IS NOT NULL;

-- ─── messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  sender_contact TEXT,
  is_quick_reply BOOLEAN NOT NULL DEFAULT false,
  moderated      BOOLEAN NOT NULL DEFAULT false,
  starred        BOOLEAN NOT NULL DEFAULT false,
  read_at        TIMESTAMPTZ,
  reply          TEXT,
  replied_at     TIMESTAMPTZ,
  reply_read_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS starred       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_member_id  ON messages(member_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- ─── scans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scanner_name TEXT,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scans_member_id  ON scans(member_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans(scanned_at DESC);

-- ─── silent_views ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS silent_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scanner_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silent_views_member_id ON silent_views(member_id);

-- ─── activation_codes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activation_codes (
  code       TEXT PRIMARY KEY,
  used       BOOLEAN NOT NULL DEFAULT false,
  member_id  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);

-- ─── orders ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  tshirt_color      TEXT NOT NULL DEFAULT 'dark',
  tshirt_size       TEXT NOT NULL DEFAULT 'M',
  stripe_session_id TEXT,
  stripe_payment_id TEXT,
  activation_code   TEXT,
  referrer_id       UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tshirt_color      TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tshirt_size       TEXT NOT NULL DEFAULT 'M';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS activation_code   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer_id       UUID REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_email             ON orders(email);

-- ─── referrals ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referrer_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);

-- ─── push_subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  message_id UUID,
  member_id  UUID REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- ─── audit_logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action     TEXT NOT NULL,
  member_id  UUID REFERENCES members(id) ON DELETE SET NULL,
  ip         TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_member_id ON audit_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action    ON audit_logs(action);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. VIEW : first_scans
-- ═══════════════════════════════════════════════════════════════════════════

-- Vue calculée : premier scan de chaque membre.
-- Utilisée pour la fenêtre de 24h dans /api/message.
CREATE OR REPLACE VIEW first_scans AS
  SELECT
    member_id,
    MIN(scanned_at) AS first_scan_at
  FROM scans
  GROUP BY member_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════════

-- Crée les buckets s'ils n'existent pas.
-- Note : INSERT ... ON CONFLICT DO NOTHING est idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('qrcodes', 'qrcodes', true)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FONCTION updated_at automatique
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur members uniquement (seule table avec updated_at)
DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- ▶ 001_enable_rls.sql
-- ═══════════════════════════════════════════════════════════════
-- 001_enable_rls.sql
-- Active Row Level Security sur toutes les tables publiques.
-- Exécuter en premier avant les policies.

ALTER TABLE members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE silent_views        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 002_rls_members.sql
-- ═══════════════════════════════════════════════════════════════
-- 002_rls_members.sql
-- Policies pour la table members.

-- Tout le monde peut lire les profils (pages publiques)
CREATE POLICY members_select_public ON members
  FOR SELECT USING (true);

-- Seul le propriétaire peut créer son profil
CREATE POLICY members_insert_own ON members
  FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- Seul le propriétaire peut modifier son profil
CREATE POLICY members_update_own ON members
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);


-- ═══════════════════════════════════════════════════════════════
-- ▶ 003_rls_messages.sql
-- ═══════════════════════════════════════════════════════════════
-- 003_rls_messages.sql
-- Policies pour la table messages.
-- INSERT bloqué pour le client anon — toutes les insertions passent par supabaseAdmin.

-- Le propriétaire du membre peut voir ses messages
CREATE POLICY messages_select_own ON messages
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Le propriétaire peut modifier ses messages (reply, starred, read_at)
CREATE POLICY messages_update_own ON messages
  FOR UPDATE
  USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les messages sont insérés par supabaseAdmin
-- via /api/message (rate limité côté applicatif).


-- ═══════════════════════════════════════════════════════════════
-- ▶ 004_rls_activation_codes.sql
-- ═══════════════════════════════════════════════════════════════
-- 004_rls_activation_codes.sql
-- Aucune policy anon : tout passe par supabaseAdmin (service role).
-- La table est verrouillée par RLS sans policy = inaccessible au client anon.

-- Pas de policy SELECT, INSERT, UPDATE, DELETE.
-- Seul le service role (supabaseAdmin) peut interagir avec cette table.


-- ═══════════════════════════════════════════════════════════════
-- ▶ 005_rls_orders.sql
-- ═══════════════════════════════════════════════════════════════
-- 005_rls_orders.sql
-- Policies pour la table orders.

-- Le propriétaire peut voir ses commandes (via email match)
CREATE POLICY orders_select_own ON orders
  FOR SELECT USING (
    email = (
      SELECT email FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT/UPDATE : tout passe par supabaseAdmin
-- (webhook Stripe pour les mises à jour, checkout pour la création).


-- ═══════════════════════════════════════════════════════════════
-- ▶ 006_rls_scans.sql
-- ═══════════════════════════════════════════════════════════════
-- 006_rls_scans.sql
-- Policies pour la table scans.

-- Le propriétaire du membre peut voir ses scans
CREATE POLICY scans_select_own ON scans
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les scans sont insérés par supabaseAdmin
-- via /api/scan (rate limité côté applicatif).


-- ═══════════════════════════════════════════════════════════════
-- ▶ 007_rls_silent_views.sql
-- ═══════════════════════════════════════════════════════════════
-- 007_rls_silent_views.sql
-- Policies pour la table silent_views.

-- Le propriétaire du membre peut voir ses vues silencieuses
CREATE POLICY silent_views_select_own ON silent_views
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les vues sont insérées par supabaseAdmin
-- via /api/silent-view (rate limité côté applicatif).


-- ═══════════════════════════════════════════════════════════════
-- ▶ 008_rls_referrals.sql
-- ═══════════════════════════════════════════════════════════════
-- 008_rls_referrals.sql
-- Policies pour la table referrals.

-- Le parrain peut voir ses referrals
CREATE POLICY referrals_select_own ON referrals
  FOR SELECT USING (
    referrer_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Seul le propriétaire peut insérer un referral pour son propre membre
CREATE POLICY referrals_insert_own ON referrals
  FOR INSERT WITH CHECK (
    referrer_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- ▶ 009_rls_push_subscriptions.sql
-- ═══════════════════════════════════════════════════════════════
-- 009_rls_push_subscriptions.sql
-- Policies pour la table push_subscriptions.
-- INSERT/SELECT/DELETE passent par supabaseAdmin.

-- Le propriétaire peut voir ses subscriptions
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Le propriétaire peut supprimer ses subscriptions
CREATE POLICY push_subscriptions_delete_own ON push_subscriptions
  FOR DELETE USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les subscriptions sont insérées par supabaseAdmin
-- via /api/push/subscribe (rate limité côté applicatif).


-- ═══════════════════════════════════════════════════════════════
-- ▶ 010_rls_audit_logs.sql
-- ═══════════════════════════════════════════════════════════════
-- 010_rls_audit_logs.sql
-- Policies pour la table audit_logs.

-- Le propriétaire du membre peut voir ses logs d'audit
CREATE POLICY audit_logs_select_own ON audit_logs
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Pas de policy INSERT : les logs sont insérés par le service role
-- via la fonction audit() côté serveur.


-- ═══════════════════════════════════════════════════════════════
-- ▶ 011_rls_storage.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 012_rpc_increment_scan_count.sql
-- ═══════════════════════════════════════════════════════════════
-- 012_rpc_increment_scan_count.sql
-- Fonction RPC pour incrémenter le compteur de scans.
-- SECURITY DEFINER = s'exécute avec les privilèges du créateur (bypass RLS).

CREATE OR REPLACE FUNCTION increment_scan_count(member_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE members
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 013_short_code.sql
-- ═══════════════════════════════════════════════════════════════
-- 013_short_code.sql
-- Ajoute un code court unique à chaque membre pour les URLs de QR code.
-- Format : 2-6 caractères alphanumériques (ex: u8, k3f, ab12).

ALTER TABLE members ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- Index pour les redirections rapides
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_short_code
  ON members (short_code) WHERE short_code IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 014_rpc_create_member.sql
-- ═══════════════════════════════════════════════════════════════
-- 014_rpc_create_member.sql
-- Création atomique d'un membre avec consommation du code d'activation.
-- Empêche la race condition TOCTOU : le UPDATE ... WHERE used = false
-- verrouille la ligne et échoue si le code est déjà utilisé.

CREATE OR REPLACE FUNCTION create_member_with_code(
  p_auth_user_id UUID,
  p_code         TEXT,
  p_name         TEXT,
  p_pitch        TEXT,
  p_email        TEXT DEFAULT NULL,
  p_instagram    TEXT DEFAULT NULL,
  p_short_code   TEXT DEFAULT NULL
)
RETURNS TABLE(member_id UUID, already_exists BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id UUID;
  v_existing_id UUID;
BEGIN
  -- 1. Vérifie si le user a déjà un profil
  SELECT id INTO v_existing_id
  FROM members
  WHERE auth_user_id = p_auth_user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, true, NULL::TEXT;
    RETURN;
  END IF;

  -- 2. Consomme le code d'activation atomiquement (UPDATE avec WHERE used = false)
  --    Si deux requêtes arrivent en même temps, seule la première réussit.
  UPDATE activation_codes
  SET used = true
  WHERE code = p_code AND used = false;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Code invalide ou déjà utilisé.'::TEXT;
    RETURN;
  END IF;

  -- 3. Crée le membre
  INSERT INTO members (auth_user_id, name, pitch, email, instagram, short_code)
  VALUES (p_auth_user_id, p_name, p_pitch, p_email, p_instagram, p_short_code)
  RETURNING id INTO v_member_id;

  -- 4. Lie le code au membre
  UPDATE activation_codes
  SET member_id = v_member_id
  WHERE code = p_code;

  RETURN QUERY SELECT v_member_id, false, NULL::TEXT;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 016_premium.sql
-- ═══════════════════════════════════════════════════════════════
-- 016_premium.sql
-- Ajout du système d'abonnement premium sur la table members.

-- Plan : 'free' (défaut après achat t-shirt) ou 'premium' (abonnement 2.99€/mois)
ALTER TABLE members ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Index pour les lookups Stripe
CREATE INDEX IF NOT EXISTS idx_members_stripe_customer_id ON members(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_stripe_subscription_id ON members(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 017_feedback.sql
-- ═══════════════════════════════════════════════════════════════
-- 017_feedback.sql
-- Table feedback : retours après conversation + feedback app général.

CREATE TABLE IF NOT EXISTS feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,  -- 'conversation' | 'app'
  rating      TEXT,           -- 'positive' | 'neutral' | 'negative' (conversation)
  message     TEXT,           -- texte libre (app feedback)
  member_id   UUID REFERENCES members(id) ON DELETE SET NULL,
  message_id  UUID REFERENCES messages(id) ON DELETE SET NULL,  -- lié à la conversation
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS : seul le service role peut insérer, le membre peut lire les siens
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select_own" ON feedback
  FOR SELECT USING (
    member_id IN (SELECT id FROM members WHERE auth_user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_feedback_member_id ON feedback(member_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);


-- ═══════════════════════════════════════════════════════════════
-- ▶ 018_scan_location.sql
-- ═══════════════════════════════════════════════════════════════
-- 018_scan_location.sql
-- Ajout de la géolocalisation sur les scans.
-- Stocke lat/lng bruts + le nom de lieu résolu (reverse geocoding).

ALTER TABLE scans ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS location  TEXT;  -- "Paris, 11e" résolu côté serveur


-- ═══════════════════════════════════════════════════════════════
-- ▶ 019_fix_scan_window.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 020_conversation_thread.sql
-- ═══════════════════════════════════════════════════════════════
-- 020_conversation_thread.sql
-- Permet les conversations multi-tours (scanner ↔ membre).
-- Ajoute un champ parent_id pour chaîner les messages dans un thread.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT 'scanner';  -- 'scanner' | 'member'

CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id) WHERE parent_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 021_fix_orders_silent_views.sql
-- ═══════════════════════════════════════════════════════════════
-- 021_fix_orders_silent_views.sql
-- Aligne le schéma avec le code.

-- orders.amount : le code envoie maintenant 4900 (centimes).
-- ⚠️ La colonne `amount` n'est créée qu'en 031. Sur une base NEUVE appliquée
-- dans l'ordre, un ALTER COLUMN direct planterait ici (la colonne n'existe pas
-- encore) → on n'atteindrait jamais 031. On guarde donc le SET DEFAULT : no-op
-- tant que la colonne n'existe pas (031 la créera avec DEFAULT 4900), et sur une
-- base existante où elle existe déjà, on (ré)applique le default. Idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount'
  ) THEN
    ALTER TABLE orders ALTER COLUMN amount SET DEFAULT 4900;
  END IF;
END $$;

-- silent_views : la colonne timestamp s'appelle viewed_at en base.
-- Le code n'écrit que member_id + scanner_name, viewed_at est géré par DEFAULT now().
-- Pas de changement nécessaire — tout est cohérent.


-- ═══════════════════════════════════════════════════════════════
-- ▶ 022_fulfillment.sql
-- ═══════════════════════════════════════════════════════════════
-- 022_fulfillment.sql
-- Suivi du fulfillment Printful : permet de déclencher Printful après activation
-- (et pas seulement quand le metadata Stripe contient déjà un userId).
--
-- Idempotence : fulfillOrder() vérifie printful_order_id avant d'appeler Printful.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS printful_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_activation_code
  ON orders(activation_code)
  WHERE activation_code IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 023_cleanup.sql
-- ═══════════════════════════════════════════════════════════════
-- 023_cleanup.sql
-- Fonction de nettoyage des données expirées. Appelée soit par pg_cron
-- (Supabase dashboard), soit par l'endpoint POST /api/cron/cleanup
-- (Vercel Cron, GitHub Actions, etc.) via un secret partagé.
--
-- Rétentions appliquées :
--  * audit_logs   : 12 mois (CNIL recommande ~12 mois pour logs de sécurité)
--  * activation_codes non utilisés : 90 jours (équivaut à TTL pour codes orphelins)
--  * scans        : 24 mois (cohérent avec la politique de confidentialité)
--  * silent_views : 24 mois

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted        BIGINT,
  activation_codes_deleted  BIGINT,
  scans_deleted             BIGINT,
  silent_views_deleted      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
BEGIN
  -- audit_logs > 12 mois
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE created_at < (now() - interval '12 months')
    RETURNING id
  )
  SELECT count(*) INTO v_audit_logs FROM deleted;

  -- activation_codes non utilisés > 90 jours
  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false
      AND created_at < (now() - interval '90 days')
    RETURNING code
  )
  SELECT count(*) INTO v_activation_codes FROM deleted;

  -- scans > 24 mois
  WITH deleted AS (
    DELETE FROM scans
    WHERE scanned_at < (now() - interval '24 months')
    RETURNING id
  )
  SELECT count(*) INTO v_scans FROM deleted;

  -- silent_views > 24 mois
  WITH deleted AS (
    DELETE FROM silent_views
    WHERE viewed_at < (now() - interval '24 months')
    RETURNING id
  )
  SELECT count(*) INTO v_silent_views FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views;
END;
$$;

-- Pour planifier en pg_cron (extension Supabase paid plan) :
--   SELECT cron.schedule('irs-cleanup', '0 3 * * 0', $$SELECT cleanup_old_data();$$);
-- Sinon, déclencher POST /api/cron/cleanup avec header x-cron-secret depuis Vercel Cron.


-- ═══════════════════════════════════════════════════════════════
-- ▶ 024_scan_reminder.sql
-- ═══════════════════════════════════════════════════════════════
-- 024_scan_reminder.sql
-- Tracking de l'envoi du reminder J+7 (si scan_count = 0).
-- L'idempotence est garantie par ce timestamp : aucun email envoyé deux fois.

ALTER TABLE members ADD COLUMN IF NOT EXISTS scan_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_members_scan_reminder_candidates
  ON members(created_at)
  WHERE scan_count = 0
    AND scan_reminder_sent_at IS NULL
    AND is_paused = false;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 025_fuse_reply_into_thread.sql
-- ═══════════════════════════════════════════════════════════════
-- 025_fuse_reply_into_thread.sql
-- Fusion du double système de réponse :
--   * legacy : colonne messages.reply (1 réponse texte stockée sur la ligne du message initial)
--   * nouveau : table messages avec parent_id + author='member' (thread complet)
--
-- Cette migration :
--   1. Backfill : convertit chaque legacy reply en ligne de thread (idempotent)
--   2. Crée une vue member_inbox qui dérive le statut de réponse pour la
--      dashboard inbox (au lieu de lire les colonnes legacy)
--
-- Les colonnes legacy (reply, replied_at, reply_read_at) ne sont PAS droppées
-- ici — on garde pour rollback. Une migration future pourra les supprimer
-- après observation de la stabilité.
--
-- Avant d'appliquer, vérifier :
--   SELECT COUNT(*) FROM messages WHERE reply IS NOT NULL AND parent_id IS NULL;
--   -- Doit retourner le nombre de replies à migrer
--
-- Après application :
--   SELECT COUNT(*) FROM messages WHERE author='member' AND parent_id IS NOT NULL;
--   -- Doit avoir augmenté du même nombre

-- ─── 1. Backfill du thread depuis la colonne reply ───────────────────────────
-- Idempotent : skip les messages qui ont déjà une thread reply membre.

INSERT INTO messages (
  member_id,
  parent_id,
  author,
  content,
  is_quick_reply,
  moderated,
  sender_contact,
  read_at,
  created_at
)
SELECT
  m.member_id,
  m.id                                                AS parent_id,
  'member'                                            AS author,
  m.reply                                             AS content,
  false                                               AS is_quick_reply,
  false                                               AS moderated,
  NULL                                                AS sender_contact,
  m.reply_read_at                                     AS read_at,
  COALESCE(m.replied_at, m.created_at)                AS created_at
FROM messages m
WHERE m.reply IS NOT NULL
  AND m.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM messages t
    WHERE t.parent_id = m.id
      AND t.author    = 'member'
  );

-- ─── 2. Vue inbox enrichie ───────────────────────────────────────────────────
-- Pour chaque message racine (parent_id IS NULL), expose le statut de réponse
-- membre (existence + heure + lu par scanner). La dashboard inbox lit cette vue
-- au lieu des colonnes legacy.

CREATE OR REPLACE VIEW member_inbox AS
SELECT
  m.id,
  m.member_id,
  m.content,
  m.sender_contact,
  m.is_quick_reply,
  m.moderated,
  m.read_at,
  m.created_at,
  -- Champs dérivés du thread :
  first_reply.content    AS reply,
  first_reply.created_at AS replied_at,
  first_reply.read_at    AS reply_read_at
FROM messages m
LEFT JOIN LATERAL (
  SELECT content, created_at, read_at
  FROM messages
  WHERE parent_id = m.id
    AND author    = 'member'
    AND moderated = false
  ORDER BY created_at ASC
  LIMIT 1
) first_reply ON true
WHERE m.parent_id IS NULL;

-- Permissions identiques à messages (la RLS sur messages s'applique aux lignes
-- sous-jacentes, donc la vue hérite naturellement de la protection).
GRANT SELECT ON member_inbox TO authenticated, anon, service_role;

COMMENT ON VIEW member_inbox IS
'Vue inbox des messages racine avec statut de réponse membre dérivé du thread.
Remplace la lecture directe des colonnes legacy messages.reply / replied_at / reply_read_at.';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 026_rls_audit.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 027_marketing_consent.sql
-- ═══════════════════════════════════════════════════════════════
-- 027_marketing_consent.sql
-- Consentement marketing séparé du consent analytics.
-- Par défaut false (opt-in obligatoire RGPD). Mis à jour explicitement par
-- le membre via /api/member/update ou la case à cocher à l'inscription.
--
-- Le ConsentBanner gère uniquement le consent analytics (PostHog) — ce
-- consentement marketing est demandé séparément lors d'actions concernant
-- les emails non-transactionnels.

ALTER TABLE members ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN members.marketing_consent IS
  'Consentement explicite pour recevoir des emails marketing/newsletter
(RGPD art. 7). Distinct du consent analytics (cookie banner). Doit être true
AVANT toute envoi d''email marketing.';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 028_newsletter.sql
-- ═══════════════════════════════════════════════════════════════
-- 028_newsletter.sql
-- Capture des emails newsletter (visiteurs non-acheteurs).
-- RGPD : consentement explicite via le formulaire opt-in, horodaté à la
-- création. Désinscription via lien dans l'email (à câbler quand on enverra
-- une vraie newsletter).

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  source      TEXT,                              -- ex: 'shop_inline', 'manifesto_cta'
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  ip          TEXT,                              -- preuve de consentement (RGPD)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Aucune policy : accessible UNIQUEMENT via service_role (route /api/newsletter
-- via supabaseAdmin). Les visiteurs anon ne peuvent ni lire ni modifier.

COMMENT ON TABLE newsletter_subscribers IS
  'Inscrits newsletter (capture leads pré-achat). RGPD : preuve de consentement
via consented_at + ip stockés à l''inscription. Désinscription en marquant
unsubscribed_at (soft delete) — purge effective via cron après 24 mois.';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 029_drop_legacy_reply_columns.sql
-- ═══════════════════════════════════════════════════════════════
-- 029_drop_legacy_reply_columns.sql
-- Supprime définitivement les colonnes legacy messages.reply / replied_at /
-- reply_read_at. La migration 025 a backfillé leurs valeurs dans le thread
-- (rows avec parent_id + author='member') et la vue member_inbox dérive ces
-- champs pour la dashboard inbox.
--
-- ⚠️ AVANT d'appliquer cette migration en prod :
--   1. Vérifier que 025_fuse_reply_into_thread.sql a bien été exécutée :
--      SELECT COUNT(*) FROM messages WHERE author='member' AND parent_id IS NOT NULL;
--      -- Doit être ≥ ce qu'il y avait dans reply column avant
--
--   2. Vérifier que plus aucune code ne lit ces colonnes directement :
--      git grep -E "\\.reply\\b|replied_at|reply_read_at" src/
--      -- Doit retourner uniquement la vue member_inbox (dans la migration 025)
--      -- ou les noms de paramètres email/emailReponse (string params, pas DB)
--
--   3. Période d'observation après 025 : ≥ 2 semaines en prod sans bug observé.

ALTER TABLE messages DROP COLUMN IF EXISTS reply;
ALTER TABLE messages DROP COLUMN IF EXISTS replied_at;
ALTER TABLE messages DROP COLUMN IF EXISTS reply_read_at;

-- La vue member_inbox reste valide car elle dérive ces noms de colonnes
-- depuis le thread (LATERAL JOIN), donc ils sont créés à la volée par la vue
-- et non lus depuis la table messages.


-- ═══════════════════════════════════════════════════════════════
-- ▶ 030_rls_members_complete.sql
-- ═══════════════════════════════════════════════════════════════
-- 030_rls_members_complete.sql
-- Ferme la dernière fuite GDPR sur members : un user authentifié pouvait
-- toujours SELECT email/stripe_customer_id/stripe_subscription_id/plan_expires_at
-- d'autres membres via le client JS (la policy members_select_public USING(true)
-- accordait l'accès, et le REVOKE column-level de la migration 026 ne couvrait
-- QUE le rôle anon).
--
-- Approche :
--   1. REVOKE column-level pour le rôle authenticated également
--   2. Fonction RPC get_own_member() SECURITY DEFINER pour que l'utilisateur
--      puisse récupérer SON PROPRE profil complet (la fonction tourne en
--      service_role et bypass donc le REVOKE)
--
-- Les routes API serveur qui ont besoin de email/stripe_* d'autres membres
-- (ex: /api/scan, /api/message, /api/webhook/stripe) utilisent supabaseAdmin
-- = service_role, donc inchangées.

-- ─── 1. REVOKE column-level pour authenticated ──────────────────────────────
REVOKE SELECT (email, stripe_customer_id, stripe_subscription_id, plan_expires_at)
  ON members FROM authenticated;

-- ─── 2. RPC pour lire son propre profil complet ─────────────────────────────
-- SECURITY DEFINER : la fonction s'exécute avec les privilèges du créateur
-- (postgres en général), donc bypass les column-level REVOKE.
-- STABLE : pas d'écriture, optimisable en cache de transaction.

CREATE OR REPLACE FUNCTION get_own_member()
RETURNS members
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_own_member() TO authenticated;
REVOKE EXECUTE ON FUNCTION get_own_member() FROM anon, public;

COMMENT ON FUNCTION get_own_member() IS
  'Retourne le profil complet (incluant email, stripe_*, plan_expires_at)
de l''utilisateur authentifié. Bypass le REVOKE column-level via SECURITY
DEFINER. Refuse silencieusement si appelé en anon (aucune row ne match).';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 031_fix_orders_amount.sql
-- ═══════════════════════════════════════════════════════════════
-- 031_fix_orders_amount.sql
-- Fix : la colonne orders.amount est référencée par /api/shop/checkout
-- (INSERT amount: 4900) et par la migration 021 (ALTER COLUMN amount SET DEFAULT),
-- mais elle n'a JAMAIS été créée — ni dans le CREATE TABLE de 015, ni via un
-- ADD COLUMN. Conséquence :
--   * migration 021 échoue (ALTER COLUMN sur colonne inexistante)
--   * l'INSERT du shop checkout échoue ("column amount does not exist")
--
-- Cette migration crée la colonne de façon idempotente. amount en centimes
-- (4900 = 49€). Source de vérité du prix = Stripe ; cette colonne sert au
-- reporting interne et au matching.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount INTEGER NOT NULL DEFAULT 4900;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 032_index_stripe_subscription.sql
-- ═══════════════════════════════════════════════════════════════
-- 032_index_stripe_subscription.sql
-- Le webhook Stripe (handleSubscriptionChange) fait des lookups
--   members WHERE stripe_subscription_id = ?
-- mais seul stripe_customer_id était indexé (migration 016). Sans index sur
-- stripe_subscription_id, chaque event subscription.updated/deleted déclenche
-- un full table scan de members. Négligeable à 100 membres, coûteux à 100K.

CREATE INDEX IF NOT EXISTS idx_members_stripe_subscription_id
  ON members(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 033_rls_hardening_views.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 034_record_scan.sql
-- ═══════════════════════════════════════════════════════════════
-- 034_record_scan.sql
-- Enregistre un scan ET incrémente scan_count dans UNE SEULE transaction.
--
-- Avant : /api/scan faisait 2 opérations séparées (INSERT scans + RPC
-- increment_scan_count). Si l'incrément échouait (réseau, etc.), la ligne scans
-- existait mais le compteur n'était pas incrémenté → scan_count dérivait
-- durablement, sans réconciliation. Cette fonction garantit l'atomicité : soit
-- les deux réussissent, soit rien.
--
-- SECURITY DEFINER : bypass la RLS (scans est owner-only en SELECT ; les
-- écritures passent par cette fonction appelée en service_role depuis /api/scan).

CREATE OR REPLACE FUNCTION record_scan(
  p_member_id    UUID,
  p_scanner_name TEXT,
  p_latitude     DOUBLE PRECISION,
  p_longitude    DOUBLE PRECISION,
  p_location     TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO scans (member_id, scanner_name, latitude, longitude, location)
  VALUES (p_member_id, p_scanner_name, p_latitude, p_longitude, p_location);

  UPDATE members
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = p_member_id;
END;
$$;

-- Défense en profondeur : seul service_role (via /api/scan) peut l'appeler.
REVOKE EXECUTE ON FUNCTION record_scan(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION record_scan(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;

COMMENT ON FUNCTION record_scan IS
  'Insère un scan + incrémente members.scan_count atomiquement. Remplace le
duo INSERT scans / increment_scan_count de /api/scan (qui pouvait dériver).';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 035_secure_create_member_rpc.sql
-- ═══════════════════════════════════════════════════════════════
-- 035_secure_create_member_rpc.sql
-- FAILLE : create_member_with_code (014) est SECURITY DEFINER mais n'avait aucun
-- REVOKE → Postgres accorde EXECUTE à PUBLIC par défaut. N'importe quel client
-- avec la clé anon publique pouvait l'appeler en direct (POST /rest/v1/rpc/...),
-- contournant requireAuth. Pire : p_auth_user_id est un PARAMÈTRE (pas auth.uid()),
-- donc on pouvait créer un membre lié à n'importe quel compte + brûler des codes.
--
-- Correctif : seul service_role (utilisé par /api/member/create, qui a déjà fait
-- requireAuth et passe l'auth.user.id vérifié) peut exécuter la fonction.
-- service_role n'a pas d'auth.uid() → garder p_auth_user_id en paramètre est
-- correct DÈS LORS que seul le backend de confiance peut appeler.
--
-- (Aligne create_member_with_code sur get_own_member (030) et record_scan (034).)

REVOKE EXECUTE ON FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Hygiène : search_path figé (manquait, contrairement à 030/034).
ALTER FUNCTION create_member_with_code(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) SET search_path = public;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 036_cleanup_push_subscriptions.sql
-- ═══════════════════════════════════════════════════════════════
-- 036_cleanup_push_subscriptions.sql
-- Ajoute la purge des push_subscriptions à cleanup_old_data().
--
-- Les subscriptions des SCANNERS (créées par /api/push/subscribe avec
-- member_id NULL et un message_id SANS FK) n'étaient nettoyées par rien :
--   * pas la cascade member_id (NULL),
--   * pas de FK message_id (inexistante) → suppression de message ne cascade pas,
--   * pas le cleanup (ne les listait pas).
-- Elles s'accumulaient indéfiniment (un endpoint push = pseudo-identifiant de
-- device). Les conversations étant éphémères (fenêtre 24-48h, thread de 5 msgs),
-- une sub > 90 jours concerne forcément une conversation terminée.

-- ⚠️ DROP obligatoire : on change le set de colonnes de RETURNS TABLE (4→5),
-- ce que CREATE OR REPLACE refuse ("cannot change return type"). IF EXISTS pour
-- rester idempotent / ré-exécutable.
DROP FUNCTION IF EXISTS cleanup_old_data();

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs WHERE created_at < (now() - interval '12 months') RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE viewed_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

-- Défense en profondeur : DROP réinitialise les grants → on relock à service_role
-- (fonction SECURITY DEFINER faisant des DELETE de masse ; appelée par le cron
-- via supabaseAdmin). Aligne sur record_scan (034) / create_member (035).
REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 037_blocks.sql
-- ═══════════════════════════════════════════════════════════════
-- 037_blocks.sql
-- Sécurité « grade produit » : permet à un porteur de bloquer un scanneur.
--
-- Contexte : le scanneur est anonyme (pas de compte). Pour qu'un blocage ait du
-- sens au-delà d'une seule conversation, on s'appuie sur un jeton de device
-- pseudonyme (cookie httpOnly `irs_sender`, posé côté scanneur lors de son
-- premier message — voir src/lib/sender-token.ts). Base légale : intérêt
-- légitime (art. 6.1.f RGPD), anti-harcèlement. Aucun usage analytics.
--
-- Deux niveaux :
--   * messages.blocked_at  → cette conversation est close (plus aucun message)
--   * table blocks         → ce device ne peut plus rouvrir de conv ni répondre
--                            à ce porteur (quand un sender_token est connu)
--
-- Limite assumée : effacer ses cookies / navigation privée réinitialise le
-- jeton. Le blocage relève la barre, il n'est pas infaillible (anonymat oblige).
-- Idempotent : safe à rejouer.

-- ─── 1. Colonnes sur messages (uniquement pertinentes sur le message racine) ──
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_token TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS blocked_at   TIMESTAMPTZ;

-- Retrouver les conversations d'un device pour un porteur donné.
CREATE INDEX IF NOT EXISTS idx_messages_sender_token
  ON messages(member_id, sender_token)
  WHERE sender_token IS NOT NULL;

-- ─── 2. Table blocks : (porteur, jeton device) ───────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  sender_token TEXT NOT NULL,
  message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,  -- conv d'origine
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, sender_token)
);

-- La contrainte UNIQUE crée déjà l'index (member_id, sender_token) utilisé par
-- le check de blocage côté /api/message et /api/conversation/reply.

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
-- Toutes les écritures passent par supabaseAdmin (service_role bypass RLS).
-- On expose seulement une lecture owner-only au cas où un jour la dashboard
-- lirait la table côté client. Pas de policy INSERT/UPDATE/DELETE → anon et
-- authenticated ne peuvent pas écrire.
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocks_select_own ON blocks;
CREATE POLICY blocks_select_own ON blocks
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Le jeton de device est une donnée de sécurité : jamais lisible par anon.
REVOKE ALL ON blocks FROM anon;
GRANT SELECT ON blocks TO authenticated;
GRANT ALL    ON blocks TO service_role;

COMMENT ON TABLE blocks IS
'Blocages porteur → device scanneur (sender_token pseudonyme). Intérêt légitime
anti-harcèlement (art. 6.1.f RGPD). Purgé en cascade avec le membre.';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 038_require_contact_and_inbox_blocked.sql
-- ═══════════════════════════════════════════════════════════════
-- 038_require_contact_and_inbox_blocked.sql
-- Compléments sécurité « grade produit » (suite de 037) :
--   1. members.require_contact : le porteur peut exiger un contact (@insta/email)
--      pour qu'un scanneur puisse lui écrire (réduit le harcèlement anonyme).
--   2. member_inbox expose blocked_at → la dashboard peut afficher un badge
--      « Bloqué » sans ouvrir la conversation.
-- Idempotent.

-- ─── 1. require_contact ──────────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS require_contact BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. member_inbox + blocked_at ────────────────────────────────────────────
-- CREATE OR REPLACE : on garde l'ordre exact des colonnes existantes (contrainte
-- Postgres) et on ajoute blocked_at EN DERNIER. On ré-affirme security_invoker
-- (durcissement 033 — un simple CREATE OR REPLACE pourrait le réinitialiser) et
-- le REVOKE anon/authenticated. JAMAIS sender_token dans la vue (donnée tierce).
CREATE OR REPLACE VIEW member_inbox WITH (security_invoker = on) AS
SELECT
  m.id,
  m.member_id,
  m.content,
  m.sender_contact,
  m.is_quick_reply,
  m.moderated,
  m.read_at,
  m.created_at,
  first_reply.content    AS reply,
  first_reply.created_at AS replied_at,
  first_reply.read_at    AS reply_read_at,
  m.blocked_at
FROM messages m
LEFT JOIN LATERAL (
  SELECT content, created_at, read_at
  FROM messages
  WHERE parent_id = m.id
    AND author    = 'member'
    AND moderated = false
  ORDER BY created_at ASC
  LIMIT 1
) first_reply ON true
WHERE m.parent_id IS NULL;

-- Ré-affirme le durcissement de 033.
REVOKE SELECT ON member_inbox FROM anon, authenticated;
GRANT  SELECT ON member_inbox TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 039_message_sender_name.sql
-- ═══════════════════════════════════════════════════════════════
-- 039_message_sender_name.sql
-- Prénom optionnel du scanneur, transmis au porteur.
--
-- Pourquoi : le parcours était trop anonyme au moment décisif. Le prénom était
-- capturé par /unlock (localStorage) mais jamais transmis — le porteur ne voyait
-- qu'un @contact ou « Anonyme ». Pour un produit de rencontre IRL, un prénom
-- humanise le signal bien plus qu'un handle. Champ OPTIONNEL : l'anonymat reste
-- le défaut. Modéré côté API comme le contenu (un nom abusif est droppé).
-- Idempotent.

-- ─── 1. Colonne sender_name ──────────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- ─── 2. member_inbox + sender_name ───────────────────────────────────────────
-- CREATE OR REPLACE : on garde l'ordre EXACT des colonnes existantes (contrainte
-- Postgres) et on ajoute sender_name EN DERNIER (après blocked_at, ajouté en
-- 038). On ré-affirme security_invoker (033) et le REVOKE anon/authenticated.
-- JAMAIS sender_token dans la vue (donnée tierce). sender_name, lui, est destiné
-- au porteur (son inbox owner-only) — sûr à exposer ici.
CREATE OR REPLACE VIEW member_inbox WITH (security_invoker = on) AS
SELECT
  m.id,
  m.member_id,
  m.content,
  m.sender_contact,
  m.is_quick_reply,
  m.moderated,
  m.read_at,
  m.created_at,
  first_reply.content    AS reply,
  first_reply.created_at AS replied_at,
  first_reply.read_at    AS reply_read_at,
  m.blocked_at,
  m.sender_name
FROM messages m
LEFT JOIN LATERAL (
  SELECT content, created_at, read_at
  FROM messages
  WHERE parent_id = m.id
    AND author    = 'member'
    AND moderated = false
  ORDER BY created_at ASC
  LIMIT 1
) first_reply ON true
WHERE m.parent_id IS NULL;

-- Ré-affirme le durcissement de 033.
REVOKE SELECT ON member_inbox FROM anon, authenticated;
GRANT  SELECT ON member_inbox TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 040_audit_retain_consent.sql
-- ═══════════════════════════════════════════════════════════════
-- 040_audit_retain_consent.sql
-- RGPD M2 : la purge cleanup_old_data() supprimait TOUS les audit_logs > 12 mois,
-- y compris la PREUVE DE CONSENTEMENT marketing (member.marketing_consent_changed,
-- art. 7 RGPD) et les preuves d'opérations RGPD (export, suppression, reclaim).
-- Détruire ces traces > 12 mois affaiblit la capacité à prouver qu'on avait bien
-- le consentement (ou qu'on a honoré une demande). On les EXEMPTE de la purge.
-- Volume négligeable (événements rares au niveau membre) vs message/scan.
--
-- Changement de CORPS uniquement (même RETURNS TABLE) → CREATE OR REPLACE suffit
-- (préserve les grants ; on les ré-affirme par sécurité).

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
BEGIN
  -- Purge des audit_logs > 12 mois SAUF les preuves de consentement / d'opérations
  -- RGPD, conservées comme preuve (art. 7 + traçabilité des droits exercés).
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE created_at < (now() - interval '12 months')
      AND action NOT IN (
        'member.marketing_consent_changed',
        'member.data_exported',
        'member.deleted',
        'member.reclaimed'
      )
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE viewed_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 041_security_scan_count_and_consent.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 042_members_select_allowlist.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 043_newsletter_campaigns.sql
-- ═══════════════════════════════════════════════════════════════
-- 043_newsletter_campaigns.sql
-- Suivi + idempotence des envois de newsletter (POST /api/newsletter/send, protégé
-- par INTERNAL_SECRET). L'envoi marketing n'existait pas encore : la capture et la
-- désinscription signée étaient prêtes, il manquait le chemin d'envoi.
--
-- `key` = slug fourni par l'opérateur. sent_at est posé AU DÉBUT de l'envoi (claim)
-- → sémantique « au plus une fois » : un POST rejoué après un crash ne ré-envoie
-- PAS (ne pas spammer prime sur garantir la livraison ; les manqués → nouvelle key).

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  subject     TEXT NOT NULL,
  recipients  INTEGER NOT NULL DEFAULT 0,
  failures    INTEGER NOT NULL DEFAULT 0,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verrouillé service_role uniquement (RLS activée, aucune policy) — comme
-- newsletter_subscribers / activation_codes.
ALTER TABLE newsletter_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON newsletter_campaigns FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 044_profile_completion_reminders.sql
-- ═══════════════════════════════════════════════════════════════
-- 044_profile_completion_reminders.sql
-- Relance « compte créé mais profil jamais finalisé » : un acheteur qui a payé,
-- confirmé son email et créé son compte auth MAIS abandonné l'étape profil →
-- aucun `members` lié → le fulfillment Printful n'est jamais déclenché → t-shirt
-- payé jamais fabriqué. Détecté par le funnel (account_created sans member_created).
-- Le cron /api/cron/activation-reminder les relance UNE fois.

-- Suivi des relances envoyées (idempotence : une seule relance par compte).
CREATE TABLE IF NOT EXISTS profile_completion_reminders (
  auth_user_id UUID PRIMARY KEY,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profile_completion_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profile_completion_reminders FROM anon, authenticated;  -- service_role only

-- Comptes auth confirmés, SANS profil membre, créés il y a 2 h–7 j, pas encore
-- relancés. SECURITY DEFINER : lit auth.users (hors schéma public). search_path
-- figé + EXECUTE révoqué pour anon/public (jamais appelable à la clé anon).
CREATE OR REPLACE FUNCTION accounts_pending_profile()
RETURNS TABLE(auth_user_id UUID, email TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email
  FROM auth.users u
  LEFT JOIN members m                       ON m.auth_user_id = u.id
  LEFT JOIN profile_completion_reminders r  ON r.auth_user_id = u.id
  WHERE m.id IS NULL                       -- pas de profil
    AND r.auth_user_id IS NULL             -- pas déjà relancé
    AND u.email_confirmed_at IS NOT NULL   -- email confirmé (vrai abandon, pas mi-flux)
    AND u.email IS NOT NULL
    AND u.created_at < now() - interval '2 hours'   -- laisse le temps de finir seul
    AND u.created_at > now() - interval '7 days'     -- ne harcèle pas les comptes périmés
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION accounts_pending_profile() FROM anon, public;
GRANT  EXECUTE ON FUNCTION accounts_pending_profile() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 045_fix_members_update_and_cleanup.sql
-- ═══════════════════════════════════════════════════════════════
-- 045_fix_members_update_and_cleanup.sql
-- Deux bugs trouvés à la revue complète 2026-06-27.

-- ─── 🔴 #1. Escalade de privilèges : UPDATE colonne-libre sur members ──────────
-- members_update_own (002) ne contrôle que la LIGNE (auth.uid()=auth_user_id) ;
-- aucun contrôle de COLONNE. Le rôle authenticated garde le GRANT UPDATE par défaut
-- → un membre peut PATCH /rest/v1/members?id=eq.<self> avec {plan:'premium',
-- plan_expires_at:'2099-...', scan_count:99999, stripe_subscription_id:...} depuis
-- le navigateur (clé anon) → s'auto-octroie le premium (bypass Stripe total) et
-- gonfle ses métriques.
-- Fix : REVOKE UPDATE — l'app n'écrit JAMAIS members côté client (tout passe par
-- supabaseAdmin / RPC SECURITY DEFINER = service_role, non affecté). 041 n'avait
-- fermé que le SELECT (colonnes) + le RPC increment_scan_count, pas l'UPDATE direct.
REVOKE UPDATE ON members FROM anon, authenticated;

-- ─── 🔴 #2. cleanup_old_data() référence silent_views.viewed_at (inexistant) ───
-- silent_views est créée avec `created_at` (015) ; aucun rename vers viewed_at
-- n'existe. La fonction DELETE ... WHERE viewed_at → échoue à l'exécution sur une
-- base conforme aux migrations → cron /api/cron/cleanup en 500 → plus AUCUNE purge
-- RGPD (audit/scans/silent_views/push). Corps inchangé sinon (cf. 040), juste la
-- colonne corrigée en created_at.
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE created_at < (now() - interval '12 months')
      AND action NOT IN (
        'member.marketing_consent_changed',
        'member.data_exported',
        'member.deleted',
        'member.reclaimed'
      )
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE created_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 046_abuse_controls_and_activation_consent.sql
-- ═══════════════════════════════════════════════════════════════
-- 046_abuse_controls_and_activation_consent.sql
-- Trois chantiers issus de la revue design QR→messagerie (2026-06-29) :
--   §5  bannissement global d'un device (cross-porteurs) + trace d'abus durable
--   §8/9 consentement bien/service horodaté à l'activation
-- (Le §4 « un seul message par device » est purement applicatif — pas de SQL.)

-- ─── §5a. Bannissement GLOBAL d'un device (sender_token) ──────────────────────
-- Le blocage existant (table `blocks`) est par-porteur. Pour le harcèlement EN
-- SÉRIE (même device, plusieurs porteurs), l'ops a besoin d'un ban global. Le
-- sender_token étant le même device sur tous les porteurs, on le bannit ici une
-- fois. Peuplée manuellement par l'ops (SQL / dashboard) après corrélation des
-- sender_token dans audit_logs ; pas d'UI admin pour l'instant.
CREATE TABLE IF NOT EXISTS banned_devices (
  sender_token TEXT PRIMARY KEY,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aucun accès anon/authenticated : seul service_role (supabaseAdmin) lit/écrit.
ALTER TABLE banned_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON banned_devices FROM anon, authenticated;

-- ─── §8/9. Consentement d'activation (preuve juridique) ───────────────────────
-- terms_accepted_at      : acceptation CGV/CGU horodatée.
-- service_waiver_at       : demande d'exécution immédiate du SERVICE + renonciation
--                           au droit de rétractation SUR LE SERVICE (le t-shirt
--                           reste un bien rétractable 14 j). Sépare bien/service.
-- Colonnes privées : hors allowlist SELECT publique (042), écrites par service_role.
ALTER TABLE members ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS service_waiver_at TIMESTAMPTZ;

-- ─── §5b + §6. Rétention différenciée des logs d'abus ────────────────────────
-- cleanup_old_data() purge audit_logs à 12 mois. On veut :
--   - garder la TRACE d'abus plus longtemps que le contenu (qui, lui, est purgé) :
--     message.moderated / message.reported / conversation.blocked → 24 mois ;
--   - exempter durablement les PREUVES de consentement, dont la nouvelle
--     member.activated (preuve CGV + renonciation service) — comme les autres.
-- (Reprend 045 à l'identique sauf le bloc audit_logs.)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE action NOT IN (
        -- Preuves de consentement / opérations RGPD : conservées (pas de purge)
        'member.marketing_consent_changed',
        'member.data_exported',
        'member.deleted',
        'member.reclaimed',
        'member.activated'
      )
      AND (
        -- Trace d'abus : rétention étendue à 24 mois (le contenu, lui, est purgé)
        (action IN ('message.moderated', 'message.reported', 'conversation.blocked')
           AND created_at < (now() - interval '24 months'))
        OR
        -- Tout le reste : 12 mois
        (action NOT IN ('message.moderated', 'message.reported', 'conversation.blocked')
           AND created_at < (now() - interval '12 months'))
      )
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE created_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 047_one_root_message_per_device.sql
-- ═══════════════════════════════════════════════════════════════
-- 047_one_root_message_per_device.sql
-- §4 (revue bugs) — La règle « un seul message racine par device et par porteur »
-- était appliquée en check-then-insert dans /api/message (non atomique) → deux
-- requêtes concurrentes du même device (2 onglets) pouvaient l'esquiver.
-- On la rend ATOMIQUE via une contrainte d'unicité partielle. La route traite
-- désormais l'erreur 23505 comme le code 'already_messaged'.
--
-- Portée : messages RACINE (parent_id IS NULL) avec un device connu
-- (sender_token IS NOT NULL). Les replies (parent_id renseigné) et les messages
-- sans jeton (jamais insérés en pratique) ne sont pas contraints.
--
-- ⚠️ BASE EXISTANTE : si des doublons (member_id, sender_token) racine existent
-- déjà (comportement d'avant ce correctif), la création de l'index ÉCHOUERA.
-- Dédupliquer d'abord (garder le plus ancien) :
--   DELETE FROM messages m USING messages k
--   WHERE m.parent_id IS NULL AND k.parent_id IS NULL
--     AND m.member_id = k.member_id AND m.sender_token = k.sender_token
--     AND m.sender_token IS NOT NULL AND m.created_at > k.created_at;
-- (Base neuve / non déployée : rien à faire.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_root_per_device
  ON messages (member_id, sender_token)
  WHERE parent_id IS NULL AND sender_token IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 048_order_qr_style.sql
-- ═══════════════════════════════════════════════════════════════
-- 048_order_qr_style.sql
-- Choix de la FORME du QR par le client à l'achat (feature « le client choisit »).
-- Stocké sur l'order au checkout ; lu par fulfillOrder pour générer le QR dans la
-- forme demandée. Seules des formes prouvées décodables sont acceptées (voir le
-- test qr-decode) : sharp (carrés nets) / rounded (arrondi, défaut) / soft (doux).
--
-- ADD COLUMN avec DEFAULT constant = safe sur base live (PG11+ : pas de réécriture
-- de table). Les commandes existantes prennent 'rounded' (= comportement actuel).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS qr_style TEXT NOT NULL DEFAULT 'rounded';

-- Garde-fou : seules les 3 formes offertes sont acceptées (aligné sur QR_STYLES).
-- NOT VALID puis VALIDATE pour ne pas verrouiller longuement une grande table live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_qr_style_valid'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_qr_style_valid
      CHECK (qr_style IN ('sharp', 'rounded', 'soft')) NOT VALID;
    ALTER TABLE orders VALIDATE CONSTRAINT orders_qr_style_valid;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 049_order_tagline.sql
-- ═══════════════════════════════════════════════════════════════
-- 049_order_tagline.sql
-- Accroche imprimée SOUS le QR au dos du t-shirt : le hameçon qui donne une raison de
-- scanner. Le client la CHOISIT dans une bibliothèque fermée (src/lib/taglines.ts) ;
-- jamais de texte libre (aucune modération, aucun risque juridique sur un objet physique).
-- Stockée sur l'order au checkout, lue par fulfillOrder pour composer le fichier dos.
--
-- NULL = « QR seul » (option assumée). Pas de DEFAULT : l'absence de choix = pas d'accroche.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tagline_id TEXT;

-- On NE met PAS de contrainte CHECK sur les id : la whitelist vit dans le code
-- (isValidTaglineId, src/lib/taglines.ts) et évolue avec la bibliothèque, sans migration.
-- La validation serveur (checkout / member-create) refuse tout id hors bibliothèque ;
-- un id inconnu au fulfillment retombe proprement sur « QR seul » (getTagline → null).
COMMENT ON COLUMN orders.tagline_id IS
  'Slug d''accroche imprimée sous le QR (src/lib/taglines.ts). NULL = QR seul. Whitelist côté code.';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 050_order_short_code.sql
-- ═══════════════════════════════════════════════════════════════
-- 050_order_short_code.sql
-- Découplage impression ↔ activation : on RÉSERVE le short_code du QR sur la
-- commande dès le paiement, pour pouvoir imprimer le t-shirt AVANT que l'acheteur
-- n'ait créé son profil. À l'activation, le membre HÉRITE de ce même short_code
-- (le QR déjà imprimé pointe alors vers son profil).
--
-- Contrainte : le short_code doit être unique GLOBALEMENT. Il vit dans deux
-- colonnes (members.short_code réservé aux membres activés, orders.short_code
-- réservé au moment du paiement). L'unicité inter-tables est garantie côté
-- application (generateUniqueShortCode vérifie members ET orders) ; ici on pose
-- l'unicité intra-orders + l'index de lookup pour /r/<code>.
--
-- ADD COLUMN nullable, sans DEFAULT = safe sur base live (pas de réécriture).
-- Les commandes existantes gardent short_code NULL (chemin legacy « imprimer à
-- l'activation » toujours géré par le code).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Unicité intra-orders (deux commandes ne peuvent pas réserver le même code).
-- Index partiel : n'indexe que les lignes réservées (NULL exclu).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_short_code_unique
  ON orders(short_code) WHERE short_code IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 051_feedback_unique_conversation.sql
-- ═══════════════════════════════════════════════════════════════
-- 051_feedback_unique_conversation.sql
-- Un seul feedback de CONVERSATION par message (1 note par thread). Avant, le garde
-- était un check-then-insert applicatif non atomique (api/feedback) → deux
-- soumissions concurrentes inséraient deux notes pour le même message. Cet index
-- unique partiel pose la garantie côté DB ; l'app traite le 23505 en
-- « alreadySubmitted » (pas une erreur serveur).
--
-- Partiel : ne couvre que les feedbacks de conversation liés à un message ; les
-- feedbacks 'app' (message_id NULL) ne sont pas contraints.
--
-- ⚠️ Échoue si des doublons existent DÉJÀ (pré-lancement : aucune donnée réelle).
-- À valider en staging avant prod (cf. DEPLOY_CHECKLIST).
CREATE UNIQUE INDEX IF NOT EXISTS uq_feedback_conversation_message
  ON feedback(message_id)
  WHERE type = 'conversation' AND message_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 052_close_members_referrals_insert.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 053_close_definer_rpcs_to_authenticated.sql
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- ▶ 054_member_suspension.sql
-- ═══════════════════════════════════════════════════════════════
-- 054_member_suspension.sql
-- Suspension d'un profil par l'opérateur, que le porteur ne peut PAS lever.
--
-- Cas d'usage : remboursement TOTAL d'une commande dont le code a déjà activé le
-- profil (webhook charge.refunded). Avant, le profil restait actif et le QR
-- fonctionnait ; la simple pause (is_paused) ne suffit pas, le porteur la lève
-- lui-même dans Réglages.
--
-- Modèle : suspendre = suspended_at posé ET is_paused forcé à true. Toutes les
-- vérifications existantes (profil public, scan, message, sitemap, relances)
-- lisent déjà is_paused → aucune n'a besoin de connaître la suspension.
-- /api/member/update refuse de lever la pause d'un profil suspendu ; la contrainte
-- ci-dessous le garantit en base, même si un futur chemin l'oubliait.
--
-- Lever une suspension (support, SQL Editor) :
--   UPDATE members SET suspended_at = NULL, is_paused = false WHERE id = '<uuid>';
--
-- ADD COLUMN nullable sans DEFAULT = safe sur base live. Non exposée à anon /
-- authenticated (allowlist de colonnes, 042) : un scanneur voit « indisponible »,
-- jamais la raison.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_suspended_implies_paused'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_suspended_implies_paused
      CHECK (suspended_at IS NULL OR is_paused);
  END IF;
END $$;

COMMENT ON COLUMN members.suspended_at IS
  'Suspension opérateur (ex. remboursement après activation). Implique is_paused ; non levable par le porteur.';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 055_order_activation_reminders.sql
-- ═══════════════════════════════════════════════════════════════
-- 055_order_activation_reminders.sql
-- Relance des acheteurs qui ont payé mais n'ont jamais activé leur profil.
--
-- Depuis l'impression au paiement (050), le t-shirt part même sans activation :
-- chaque scan tombe alors sur « pas encore activé ». La relance existante (044)
-- ne vise que les COMPTES créés sans profil ; un acheteur qui n'a jamais créé de
-- compte n'était relancé par personne.
--
-- /api/cron/activation-reminder envoie au plus 2 relances par commande (J+2, J+7 —
-- règle dans src/lib/order-reminders.ts) et les compte ici.
--
-- ADD COLUMN avec DEFAULT constant = safe sur base live (pas de réécriture, PG ≥ 11).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS activation_reminders_sent SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS activation_reminder_at TIMESTAMPTZ;

-- Candidats du cron : commandes payées, pas encore relancées 2 fois.
CREATE INDEX IF NOT EXISTS idx_orders_activation_reminder
  ON orders (created_at)
  WHERE status = 'paid' AND activation_reminders_sent < 2;

COMMENT ON COLUMN orders.activation_reminders_sent IS
  'Relances « activez votre profil » envoyées (max 2, cf. src/lib/order-reminders.ts).';


-- ═══════════════════════════════════════════════════════════════
-- ▶ 056_message_reports.sql
-- ═══════════════════════════════════════════════════════════════
-- 056_message_reports.sql
-- Signalements de messages par les porteurs, pour le bannissement automatique.
--
-- Avant : un signalement masquait le message (moderated = true) et laissait une
-- ligne dans audit_logs, sans alerte ni suite ; bannir un appareil se faisait à
-- la main (banned_devices, migration 046). Désormais /api/report enregistre ici
-- le signalement : un appareil (sender_token) signalé par REPORT_BAN_THRESHOLD
-- porteurs différents est banni automatiquement.
--
-- Une ligne par (porteur, appareil) : un porteur qui signale plusieurs messages
-- du même appareil ne compte qu'une fois. sender_token NULL = appareil inconnu
-- (message antérieur aux jetons) : enregistré, jamais compté.

CREATE TABLE IF NOT EXISTS message_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  sender_token TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Contrainte (et non index partiel) : l'ON CONFLICT de PostgREST doit pouvoir
  -- la cibler. Les NULL restant distincts, les appareils inconnus n'y sont pas soumis.
  CONSTRAINT message_reports_member_device_uniq UNIQUE (member_id, sender_token)
);

CREATE INDEX IF NOT EXISTS idx_message_reports_sender_token
  ON message_reports (sender_token) WHERE sender_token IS NOT NULL;

-- Aucun accès anon/authenticated : seul service_role (supabaseAdmin) lit/écrit.
ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON message_reports FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 057_contact_verifications.sql
-- ═══════════════════════════════════════════════════════════════
-- 057_contact_verifications.sql
-- Vérification de l'email laissé par un passant (double opt-in).
--
-- Avant : quand le porteur répondait, la réponse partait par email à l'adresse
-- saisie par le passant, vérifiée ou non. Un passant pouvait taper l'adresse d'un
-- tiers, qui recevait alors les mots du porteur et le lien de la conversation.
-- Désormais /api/message envoie un lien de confirmation à cette adresse, et les
-- réponses n'y partent qu'une fois l'adresse confirmée.
--
-- Une ligne par message racine. Le jeton n'est jamais stocké en clair : seul son
-- SHA-256 l'est. Supprimée avec le message (purge des conversations).

CREATE TABLE IF NOT EXISTS contact_verifications (
  message_id  UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,                 -- en minuscules
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

-- Aucun accès anon/authenticated : seul service_role (supabaseAdmin) lit/écrit.
ALTER TABLE contact_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contact_verifications FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 058_rgpd_retention_city_only.sql
-- ═══════════════════════════════════════════════════════════════
-- 058_rgpd_retention_city_only.sql
-- Lot RGPD (décisions de Clément, 2026-10-22).
--
-- 1. Conversations supprimées 12 mois après leur dernier message (promesse
--    éphémère, minimisation). Supprimer le message racine emporte les réponses
--    (parent_id ON DELETE CASCADE), les vérifications d'email (057) et les
--    signalements (056). feedback et blocks gardent leur ligne (SET NULL) : un
--    blocage survit à la conversation.
-- 2. Preuves de consentement et d'opérations RGPD : 5 ans (prescription de droit
--    commun), au lieu de « jamais purgées ».
-- 3. Traces d'abus conservées 24 mois : + device.auto_banned (056) et
--    profile.reported (signalement d'un profil).
-- 4. Géolocalisation : seule la ville est conservée. record_scan ignore les
--    coordonnées (même signature : le code déjà déployé reste compatible) ; les
--    scans existants perdent leurs coordonnées et gardent la ville
--    (« quartier, ville » → « ville »).
--
-- cleanup_old_data() change de type de retour (conversations_deleted) : DROP puis
-- CREATE. Depuis 053, une nouvelle fonction n'est exécutable par personne par
-- défaut : le droit de service_role est reposé explicitement.

-- ─── 4. Géolocalisation : la ville seulement ────────────────────────────────
CREATE OR REPLACE FUNCTION record_scan(
  p_member_id    UUID,
  p_scanner_name TEXT,
  p_latitude     DOUBLE PRECISION,
  p_longitude    DOUBLE PRECISION,
  p_location     TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- p_latitude / p_longitude ignorés (minimisation) : seule la ville est gardée.
  INSERT INTO scans (member_id, scanner_name, location)
  VALUES (p_member_id, p_scanner_name, p_location);

  UPDATE members
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = p_member_id;
END;
$$;

UPDATE scans SET latitude = NULL, longitude = NULL
WHERE latitude IS NOT NULL OR longitude IS NOT NULL;

-- « quartier, ville » → « ville » (le nom était construit par parts.join(', ')).
UPDATE scans SET location = regexp_replace(location, '^.*,\s*', '')
WHERE location LIKE '%,%';

-- ─── 1 à 3. Purge hebdomadaire ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS cleanup_old_data();

CREATE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT,
  conversations_deleted       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
  v_conversations    BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE
      -- Preuves de consentement / opérations RGPD : 5 ans
      (action IN ('member.marketing_consent_changed', 'member.data_exported',
                  'member.deleted', 'member.reclaimed', 'member.activated')
         AND created_at < (now() - interval '5 years'))
      OR
      -- Traces d'abus : 24 mois (le contenu, lui, est purgé avec la conversation)
      (action IN ('message.moderated', 'message.reported', 'conversation.blocked',
                  'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '24 months'))
      OR
      -- Tout le reste : 12 mois
      (action NOT IN ('member.marketing_consent_changed', 'member.data_exported',
                      'member.deleted', 'member.reclaimed', 'member.activated',
                      'message.moderated', 'message.reported', 'conversation.blocked',
                      'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '12 months'))
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE created_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  WITH deleted AS (
    DELETE FROM push_subscriptions WHERE created_at < (now() - interval '90 days') RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  -- Conversations dont le dernier message (racine ou réponse) a plus de 12 mois.
  WITH deleted AS (
    DELETE FROM messages r
    WHERE r.parent_id IS NULL
      AND r.created_at < (now() - interval '12 months')
      AND NOT EXISTS (
        SELECT 1 FROM messages c
        WHERE c.parent_id = r.id AND c.created_at >= (now() - interval '12 months')
      )
    RETURNING r.id
  ) SELECT count(*) INTO v_conversations FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push, v_conversations;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 059_notification_throttles.sql
-- ═══════════════════════════════════════════════════════════════
-- 059_notification_throttles.sql
-- Choix de Clément (2026-10-22), expérience du porteur :
--   * email de nouveau scan : au premier scan de la journée seulement (heure de
--     Paris). À une soirée, un porteur recevait un email par téléphone qui le
--     scannait ; le tableau de bord montre tous les scans.
--   * plafond gratuit atteint (3 conversations sur 7 jours) : le porteur est
--     prévenu par email quand quelqu'un n'a pas pu lui écrire, une fois par
--     semaine au plus.
-- Réservation atomique (UPDATE … WHERE … puis FOUND) : deux requêtes simultanées
-- n'envoient qu'un email. Colonnes hors de l'allowlist client (042) : invisibles
-- pour anon et authenticated.

ALTER TABLE members ADD COLUMN IF NOT EXISTS scan_email_on DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS cap_email_at  TIMESTAMPTZ;

COMMENT ON COLUMN members.scan_email_on IS
  'Jour (heure de Paris) du dernier email « nouveau scan » : un par jour au plus.';
COMMENT ON COLUMN members.cap_email_at IS
  'Dernier email « plafond atteint, quelqu''un n''a pas pu vous écrire » : un par semaine au plus.';

-- true si l'email du jour est réservé pour ce porteur (aucun encore aujourd'hui).
CREATE OR REPLACE FUNCTION claim_scan_email(p_member_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET scan_email_on = (now() AT TIME ZONE 'Europe/Paris')::date
  WHERE id = p_member_id
    AND (scan_email_on IS NULL OR scan_email_on < (now() AT TIME ZONE 'Europe/Paris')::date);
  RETURN FOUND;
END;
$$;

-- true si l'email « plafond atteint » est réservé (aucun depuis 7 jours).
CREATE OR REPLACE FUNCTION claim_cap_email(p_member_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET cap_email_at = now()
  WHERE id = p_member_id
    AND (cap_email_at IS NULL OR cap_email_at < now() - interval '7 days');
  RETURN FOUND;
END;
$$;

-- Backend uniquement (cf. 053 : rien n'est exécutable par défaut).
REVOKE EXECUTE ON FUNCTION claim_scan_email(UUID) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION claim_cap_email(UUID)  FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION claim_scan_email(UUID) TO service_role;
GRANT  EXECUTE ON FUNCTION claim_cap_email(UUID)  TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 060_referral_code.sql
-- ═══════════════════════════════════════════════════════════════
-- 060_referral_code.sql
-- Choix de Clément (2026-10-22) : le lien de parrainage ne contient plus
-- l'identifiant du profil. /join/<id> donnait l'adresse directe du profil
-- (/profil/<id>), sans passer par le t-shirt, alors que les profils ne doivent se
-- trouver qu'en scannant. Chaque membre reçoit un code dédié, résolu côté serveur
-- seulement (colonne hors de l'allowlist client de la 042). Les liens déjà
-- partagés (/join/<uuid>) continuent de donner la remise.

-- 10 caractères de l'alphabet des codes QR (sans 0, 1, i, l, o) : ≈ 6·10^14 codes.
-- Pas un secret : le code est fait pour être partagé ; il ne doit juste pas
-- révéler l'identifiant du profil.
CREATE OR REPLACE FUNCTION gen_referral_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz2345678', 1 + floor(random() * 30)::int, 1), '')
  FROM generate_series(1, 10);
$$;

-- La colonne existe depuis 015 (TEXT UNIQUE) mais n'a jamais été remplie ni lue
-- par l'application : défaut posé ici, et tout code absent ou hors format
-- (re)généré, ligne par ligne.
ALTER TABLE members ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE members ALTER COLUMN referral_code SET DEFAULT gen_referral_code();
UPDATE members SET referral_code = gen_referral_code()
WHERE referral_code IS NULL OR referral_code !~ '^[a-hjkmnp-z2-8]{10}$';
ALTER TABLE members ALTER COLUMN referral_code SET NOT NULL;
-- Unicité : déjà assurée par la contrainte de 015 (members_referral_code_key).
CREATE UNIQUE INDEX IF NOT EXISTS members_referral_code_key ON members (referral_code);

COMMENT ON COLUMN members.referral_code IS
  'Code du lien de parrainage /join/<code> (remplace l''identifiant du profil dans le lien).';

-- Le défaut s'évalue avec les droits de qui insère : service_role (backend) et
-- les fonctions SECURITY DEFINER. Rien pour anon / authenticated (cf. 053).
REVOKE EXECUTE ON FUNCTION gen_referral_code() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION gen_referral_code() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 061_scan_email_opt_out.sql
-- ═══════════════════════════════════════════════════════════════
-- 061_scan_email_opt_out.sql
-- Choix de Clément (2026-10-22), délivrabilité des emails : le porteur peut
-- couper l'email « nouveau scan », dans ses réglages ou par le lien en un clic
-- de l'email (List-Unsubscribe). Sans ce moyen, un porteur lassé n'avait que
-- « Signaler comme spam », qui pèse sur la réputation de tous nos emails,
-- codes d'activation compris.
-- Colonne hors de l'allowlist client (042) : lue et écrite par le serveur seul.

ALTER TABLE members ADD COLUMN IF NOT EXISTS scan_emails BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN members.scan_emails IS
  'Email « nouveau scan » (un par jour au plus, 059) : false = coupé par le porteur.';

-- La réservation du jour (059) échoue si le porteur a coupé ces emails : la
-- route de scan n'a rien d'autre à vérifier.
CREATE OR REPLACE FUNCTION claim_scan_email(p_member_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET scan_email_on = (now() AT TIME ZONE 'Europe/Paris')::date
  WHERE id = p_member_id
    AND scan_emails
    AND (scan_email_on IS NULL OR scan_email_on < (now() AT TIME ZONE 'Europe/Paris')::date);
  RETURN FOUND;
END;
$$;

-- CREATE OR REPLACE garde les droits de 059 ; réaffirmés : backend seulement.
REVOKE EXECUTE ON FUNCTION claim_scan_email(UUID) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION claim_scan_email(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 062_push_porteurs_telephone.sql
-- ═══════════════════════════════════════════════════════════════
-- 062_push_porteurs_telephone.sql
-- Mesurer les notifications (choix de Clément, 2026-10-23).
--
-- 1. Purge hebdomadaire : seuls les abonnements aux notifications des PASSANTS
--    (member_id NULL, une conversation éphémère) partent au bout de 90 jours.
--    Depuis 036, elle supprimait aussi ceux des porteurs, alors qu'elle ne
--    visait que ceux des passants : un porteur cessait d'être notifié au bout
--    de 90 jours, sans le savoir. Ceux des porteurs partent avec le compte
--    (cascade), à la déconnexion (DELETE /api/push/subscribe), ou quand le
--    service de push les dit expirés (404/410 à l'envoi, lib/push-notify).
-- 2. Téléphone du porteur, relevé par le serveur à l'ouverture de « Mon
--    espace » : iPhone ou Android (rien pour un ordinateur), et première
--    ouverture de l'app installée sur l'écran d'accueil. Pour mesurer, pendant
--    le test terrain, la part des porteurs sur iPhone qui ont installé l'app.
--    Colonnes hors de l'allowlist client (042) : écrites par le serveur, lues
--    par /admin et par le porteur lui-même (get_own_member, export RGPD).

ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_os TEXT
  CHECK (phone_os IN ('ios', 'android'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS app_installed_at TIMESTAMPTZ;

COMMENT ON COLUMN members.phone_os IS
  'Téléphone de la dernière ouverture de « Mon espace » depuis un téléphone : ios ou android.';
COMMENT ON COLUMN members.app_installed_at IS
  'Première ouverture de « Mon espace » depuis l''app installée sur un téléphone (adresse de départ ?src=app).';

-- ─── Purge hebdomadaire : 058, sauf les abonnements des porteurs ─────────────
-- Même signature : CREATE OR REPLACE suffit et garde les droits, réaffirmés.
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT,
  conversations_deleted       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
  v_conversations    BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE
      -- Preuves de consentement / opérations RGPD : 5 ans
      (action IN ('member.marketing_consent_changed', 'member.data_exported',
                  'member.deleted', 'member.reclaimed', 'member.activated')
         AND created_at < (now() - interval '5 years'))
      OR
      -- Traces d'abus : 24 mois (le contenu, lui, est purgé avec la conversation)
      (action IN ('message.moderated', 'message.reported', 'conversation.blocked',
                  'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '24 months'))
      OR
      -- Tout le reste : 12 mois
      (action NOT IN ('member.marketing_consent_changed', 'member.data_exported',
                      'member.deleted', 'member.reclaimed', 'member.activated',
                      'message.moderated', 'message.reported', 'conversation.blocked',
                      'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '12 months'))
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  WITH deleted AS (
    DELETE FROM silent_views WHERE created_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  -- Passants seulement : ceux des porteurs restent tant que l'appareil est abonné.
  WITH deleted AS (
    DELETE FROM push_subscriptions
    WHERE member_id IS NULL AND created_at < (now() - interval '90 days')
    RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  -- Conversations dont le dernier message (racine ou réponse) a plus de 12 mois.
  WITH deleted AS (
    DELETE FROM messages r
    WHERE r.parent_id IS NULL
      AND r.created_at < (now() - interval '12 months')
      AND NOT EXISTS (
        SELECT 1 FROM messages c
        WHERE c.parent_id = r.id AND c.created_at >= (now() - interval '12 months')
      )
    RETURNING r.id
  ) SELECT count(*) INTO v_conversations FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push, v_conversations;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- ▶ 063_origine_achats.sql
-- ═══════════════════════════════════════════════════════════════
-- 063_origine_achats.sql
-- Origine d'un achat (choix de Clément, 2026-10-24) : le porteur dont le
-- profil, vu après un scan, a mené à la commande (lien vers la boutique depuis
-- son profil ou après un message, gardé 30 jours sur l'appareil du passant,
-- cf. src/lib/scan-origin.ts). /admin compte ces achats, en tout et par
-- porteur, sans dépendre du consentement aux mesures d'audience.
--
-- Écrite par le serveur au checkout, jamais par le client (orders : RLS sans
-- politique, aucune ligne visible côté client). Effacée avec le compte du
-- porteur (ON DELETE SET NULL), et au bout de 24 mois comme les scans dont
-- elle vient (purge hebdomadaire) ; la commande, elle, reste (obligation
-- comptable).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS from_member_id UUID
  REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_from_member_id_idx
  ON orders (from_member_id) WHERE from_member_id IS NOT NULL;

COMMENT ON COLUMN orders.from_member_id IS
  'Porteur dont le profil, vu après un scan, a mené à cet achat (30 jours, même appareil). Effacé avec son compte, ou au bout de 24 mois.';

-- ─── Purge hebdomadaire : 062, plus l'origine des achats ─────────────────────
-- Même signature : CREATE OR REPLACE suffit et garde les droits, réaffirmés.
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(
  audit_logs_deleted          BIGINT,
  activation_codes_deleted    BIGINT,
  scans_deleted               BIGINT,
  silent_views_deleted        BIGINT,
  push_subscriptions_deleted  BIGINT,
  conversations_deleted       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_logs       BIGINT;
  v_activation_codes BIGINT;
  v_scans            BIGINT;
  v_silent_views     BIGINT;
  v_push             BIGINT;
  v_conversations    BIGINT;
BEGIN
  WITH deleted AS (
    DELETE FROM audit_logs
    WHERE
      -- Preuves de consentement / opérations RGPD : 5 ans
      (action IN ('member.marketing_consent_changed', 'member.data_exported',
                  'member.deleted', 'member.reclaimed', 'member.activated')
         AND created_at < (now() - interval '5 years'))
      OR
      -- Traces d'abus : 24 mois (le contenu, lui, est purgé avec la conversation)
      (action IN ('message.moderated', 'message.reported', 'conversation.blocked',
                  'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '24 months'))
      OR
      -- Tout le reste : 12 mois
      (action NOT IN ('member.marketing_consent_changed', 'member.data_exported',
                      'member.deleted', 'member.reclaimed', 'member.activated',
                      'message.moderated', 'message.reported', 'conversation.blocked',
                      'device.auto_banned', 'profile.reported')
         AND created_at < (now() - interval '12 months'))
    RETURNING id
  ) SELECT count(*) INTO v_audit_logs FROM deleted;

  WITH deleted AS (
    DELETE FROM activation_codes
    WHERE used = false AND created_at < (now() - interval '90 days') RETURNING code
  ) SELECT count(*) INTO v_activation_codes FROM deleted;

  WITH deleted AS (
    DELETE FROM scans WHERE scanned_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_scans FROM deleted;

  -- Origine d'un achat : 24 mois, comme les scans. La commande reste.
  UPDATE orders SET from_member_id = NULL
  WHERE from_member_id IS NOT NULL AND created_at < (now() - interval '24 months');

  WITH deleted AS (
    DELETE FROM silent_views WHERE created_at < (now() - interval '24 months') RETURNING id
  ) SELECT count(*) INTO v_silent_views FROM deleted;

  -- Passants seulement : ceux des porteurs restent tant que l'appareil est abonné.
  WITH deleted AS (
    DELETE FROM push_subscriptions
    WHERE member_id IS NULL AND created_at < (now() - interval '90 days')
    RETURNING id
  ) SELECT count(*) INTO v_push FROM deleted;

  -- Conversations dont le dernier message (racine ou réponse) a plus de 12 mois.
  WITH deleted AS (
    DELETE FROM messages r
    WHERE r.parent_id IS NULL
      AND r.created_at < (now() - interval '12 months')
      AND NOT EXISTS (
        SELECT 1 FROM messages c
        WHERE c.parent_id = r.id AND c.created_at >= (now() - interval '12 months')
      )
    RETURNING r.id
  ) SELECT count(*) INTO v_conversations FROM deleted;

  RETURN QUERY SELECT v_audit_logs, v_activation_codes, v_scans, v_silent_views, v_push, v_conversations;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_old_data() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION cleanup_old_data() TO service_role;
