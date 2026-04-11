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
