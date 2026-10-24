// Notifications push. Deux portées :
//   * notifyThreadSubscribers — abonnés d'un thread (message_id) : réponses dans
//     une conversation. Appelé par /api/push/notify et /api/conversation/reply.
//   * notifyMemberSubscribers — abonnés au niveau membre (member_id) : alerte le
//     porteur de tout nouveau message reçu. Appelé par /api/message.
//
// No-op silencieux si VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ne sont pas définis
// (permet de dev/test sans configurer le push).

import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Délai d'un envoi au service de push (Apple, Google, Mozilla…). */
export const PUSH_TIMEOUT_MS = 8_000;

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

// Envoi commun à une liste d'abonnements + purge des endpoints expirés.
async function sendToSubs(
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload: string,
): Promise<PushNotifyResult> {
  if (!subs.length) return { sent: 0, failed: 0, expired: 0 };
  const expired: string[] = [];
  let sent = 0, failed = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        // Un service de push qui ne répond pas ne retient pas la fonction.
        { timeout: PUSH_TIMEOUT_MS },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) expired.push(s.endpoint);
      failed++;
    }
  }));

  // Nettoie les subscriptions expirées (410 Gone) ou introuvables (404)
  if (expired.length) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', expired);
  }
  return { sent, failed, expired: expired.length };
}

// Abonnés d'un thread (message_id) — réponses dans une conversation.
export async function notifyThreadSubscribers({ messageId, title, body, url }: PushNotifyParams): Promise<PushNotifyResult> {
  if (!initVapid()) return { sent: 0, failed: 0, expired: 0 };
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('message_id', messageId);
  return sendToSubs(subs ?? [], JSON.stringify({ title, body, url, tag: messageId }));
}

// Abonnés au niveau MEMBRE (member_id) — alerte le porteur de tout nouveau
// message reçu (abonnement posé depuis le dashboard). Le tag est par MESSAGE
// (pas par membre) : sinon l'OS remplace la notif précédente et plusieurs
// signaux reçus en absence se réduisent à un seul.
export async function notifyMemberSubscribers(
  { memberId, messageId, title, body, url }: { memberId: string; messageId?: string; title: string; body?: string; url?: string },
): Promise<PushNotifyResult> {
  if (!initVapid()) return { sent: 0, failed: 0, expired: 0 };
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('member_id', memberId);
  const tag = messageId ? `member-${memberId}-${messageId}` : `member-${memberId}`;
  return sendToSubs(subs ?? [], JSON.stringify({ title, body, url, tag }));
}
