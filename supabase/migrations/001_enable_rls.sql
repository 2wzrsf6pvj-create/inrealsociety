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
