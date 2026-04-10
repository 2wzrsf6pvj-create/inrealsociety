// lib/usePushNotification.ts
// Hook pour gérer les push notifications côté scanner

import { useEffect, useState, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  const buffer  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buffer[i] = raw.charCodeAt(i);
  }
  return buffer.buffer as ArrayBuffer;
}

export function usePushNotification(conversationId?: string) {
  const [supported, setSupported]   = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    setSupported('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window);
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  const registerSW = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return null;
    try {
      return await navigator.serviceWorker.register('/sw.js');
    } catch { return null; }
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !conversationId) return false;
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const reg = await registerSW();
      if (!reg) return false;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      await fetch('/api/push-subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint:       subJson.endpoint,
          p256dh:         subJson.keys.p256dh,
          auth:           subJson.keys.auth,
          conversationId,
        }),
      });

      setSubscribed(true);
      return true;
    } catch { return false; }
  }, [supported, conversationId, registerSW]);

  return { supported, permission, subscribed, subscribe };
}