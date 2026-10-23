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

type PushScope = { messageId: string } | { memberId: string };

/** Service worker actif attendu au plus ce délai : au-delà, l'activation échoue
 *  au lieu de laisser le bouton sur « Activation... ». */
export const SW_READY_TIMEOUT_MS = 10_000;

function applicationServerKey(): Uint8Array<ArrayBuffer> | null {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return null;
  const padding = '='.repeat((4 - vapidKey.length % 4) % 4);
  const base64  = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from(Array.from(raw), c => c.charCodeAt(0));
}

/** Enregistre l'abonnement côté serveur (idempotent : une ligne par endpoint). */
async function saveSubscription(sub: PushSubscription, scope: PushScope): Promise<boolean> {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } },
      ...scope,
    }),
  });
  return res.ok;
}

// Un device n'a qu'UN scope à la fois (push_subscriptions.onConflict:'endpoint').
// On choisit donc le bon scope selon le viewer :
//   * scanner → thread (messageId) : abonné à CETTE conversation.
//   * porteur → membre (memberId)  : abonné à TOUS ses messages, comme depuis le
//     dashboard. Indispensable car la réponse du scanner notifie le porteur via
//     notifyMemberSubscribers (member_id) ; s'abonner ici en thread scope
//     écraserait l'abonnement membre et il ne recevrait plus rien.
/** Demande l'autorisation puis abonne cet appareil. true seulement si le serveur
 *  a enregistré l'abonnement : refus, clé VAPID absente, service worker inactif
 *  ou réponse en erreur donnent false, et l'interface ne dit pas « activées ». */
export async function subscribePush(scope: PushScope): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  const key = applicationServerKey();
  if (!key) return false;
  try {
    // Premier await : la demande d'autorisation doit suivre le geste (Safari).
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    await navigator.serviceWorker.register('/sw.js');
    // Attend un service worker ACTIF : à la première ouverture de l'app installée,
    // il peut être encore en cours d'installation, et l'abonnement échouerait.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    if (!reg) return false;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return await saveSubscription(sub, scope);
  } catch (err) {
    console.error('[push] Échec inscription push:', err);
    return false;
  }
}

/** Notifications déjà accordées : renvoie au serveur l'abonnement de cet
 *  appareil. Rattrape un envoi raté, ou un abonnement effacé côté serveur (le
 *  service de push l'a dit expiré). false si l'appareil n'a plus d'abonnement
 *  ou si l'envoi échoue : il faut alors reproposer le bouton. */
export async function resyncPush(scope: PushScope): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    return await saveSubscription(sub, scope);
  } catch {
    return false;
  }
}
