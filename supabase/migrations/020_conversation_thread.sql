-- 020_conversation_thread.sql
-- Permet les conversations multi-tours (scanner ↔ membre).
-- Ajoute un champ parent_id pour chaîner les messages dans un thread.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT 'scanner';  -- 'scanner' | 'member'

CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id) WHERE parent_id IS NOT NULL;
