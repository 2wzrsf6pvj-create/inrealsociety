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
