// Diffuse un nouveau message de thread aux clients abonnés, via l'API HTTP
// Broadcast de Supabase Realtime.
//
// Pourquoi broadcast et pas postgres_changes : postgres_changes respecte la RLS,
// or un scanner est anon et ne peut pas SELECT messages → il ne recevrait jamais
// l'événement. Le broadcast public ne lit pas la DB → il atteint tout le monde
// abonné au canal `thread-<messageId>`, scanner anon compris.
//
// Serverless-friendly : un simple POST, aucun websocket à maintenir côté serveur.
// No-op silencieux si Supabase n'est pas configuré (placeholder env en dev).

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_CONFIGURED } from '@/lib/supabase-config';

export interface ThreadBroadcastPayload {
  id:         string;
  content:    string;
  author:     'scanner' | 'member';
  created_at: string;
}

export async function broadcastThreadMessage(
  messageId: string,
  reply: ThreadBroadcastPayload,
): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:         SUPABASE_SERVICE_ROLE_KEY,
        Authorization:  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      // Le `topic` doit matcher le nom du canal côté client :
      // supabase.channel(`thread-${messageId}`)
      body: JSON.stringify({
        messages: [{
          topic:   `thread-${messageId}`,
          event:   'new_message',
          payload: reply,
          private: false,
        }],
      }),
    });
  } catch (err) {
    console.error('[realtime-broadcast] échec:', err);
  }
}
