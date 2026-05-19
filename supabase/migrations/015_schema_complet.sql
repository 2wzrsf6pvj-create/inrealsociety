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
