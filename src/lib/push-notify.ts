// Envoie une notification push à tous les abonnés d'un thread (push_subscriptions
// rows ayant message_id = <messageId>). Utilisé par /api/push/notify (endpoint
// externe) ET par /api/conversation/reply (appel direct interne).
//
// No-op silencieux si VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ne sont pas définis
// (permet de dev/test sans configurer le push).

import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';

let vapidInitialized = false;

function initVapid(): boolean {
  if (vapidInitialized) return true;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hello@inrealsociety.com',
    pub,
    priv,
  );
  vapidInitialized = true;
  return true;
}

export interface PushNotifyParams {
  messageId: string;
  title:     string;
  body?:     string;
  url?:      string;
}

export interface PushNotifyResult {
  sent:    number;
  failed:  number;
  expired: number;
}

export async function notifyThreadSubscribers({ messageId, title, body, url }: PushNotifyParams): Promise<PushNotifyResult> {
  if (!initVapid()) {
    return { sent: 0, failed: 0, expired: 0 };
  }

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('message_id', messageId);

  if (!subs?.length) return { sent: 0, failed: 0, expired: 0 };

  const payload  = JSON.stringify({ title, body, url, tag: messageId });
  const expired: string[] = [];
  let sent = 0, failed = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        expired.push(s.endpoint);
      }
      failed++;
    }
  }));

  // Nettoie les subscriptions expirées (410 Gone) ou introuvables (404)
  if (expired.length) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', expired);
  }

  return { sent, failed, expired: expired.length };
}
