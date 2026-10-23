// src/lib/push-client.ts — Notifications push, côté navigateur : abonnement de
// l'appareil et détection de l'iPhone. Partagé par « Mon espace » et la page
// conversation.

/** iPhone (et iPad avant iPadOS 13, qui se présente désormais comme un Mac). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

/** Ouverte depuis l'icône de l'écran d'accueil (app installée), pas dans le
 *  navigateur. Sur iPhone, seule l'app installée reçoit des notifications
 *  (iOS 16.4+) : dans Safari, l'API n'existe même pas. */
export function isStandaloneWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type NotificationOffer = 'ios-install' | 'ask' | 'none';

/** Ce que « Mon espace » propose pour les notifications sur cet appareil :
 *  - 'ios-install' : iPhone dans Safari, expliquer l'ajout à l'écran d'accueil ;
 *  - 'ask'         : notifications possibles et pas encore demandées ;
 *  - 'none'        : déjà répondu, non supportées, ou aide iPhone masquée. */
export function notificationOffer(iosHintHidden: boolean): NotificationOffer {
  if (isIOS() && !isStandaloneWebApp()) return iosHintHidden ? 'none' : 'ios-install';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'none';
  return Notification.permission === 'default' ? 'ask' : 'none';
}

// Un device n'a qu'UN scope à la fois (push_subscriptions.onConflict:'endpoint').
// On choisit donc le bon scope selon le viewer :
//   * scanner → thread (messageId) : abonné à CETTE conversation.
//   * porteur → membre (memberId)  : abonné à TOUS ses messages, comme depuis le
//     dashboard. Indispensable car la réponse du scanner notifie le porteur via
//     notifyMemberSubscribers (member_id) ; s'abonner ici en thread scope
//     écraserait l'abonnement membre et il ne recevrait plus rien.
export async function subscribePush(scope: { messageId: string } | { memberId: string }): Promise<void> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    await navigator.serviceWorker.register('/sw.js');
    // Attend un service worker ACTIF : à la première ouverture de l'app installée,
    // il peut être encore en cours d'installation, et l'abonnement échouerait.
    const reg = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    const padding = '='.repeat((4 - vapidKey.length % 4) % 4);
    const base64  = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    const key     = Uint8Array.from(Array.from(raw), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j   = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } },
        ...scope,
      }),
    });
  } catch (err) { console.error('[push] Échec inscription push:', err); }
}
