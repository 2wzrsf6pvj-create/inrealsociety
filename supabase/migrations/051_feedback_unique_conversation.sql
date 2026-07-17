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
