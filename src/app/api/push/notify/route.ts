// src/app/api/push/notify/route.ts
// POST { messageId, title, body, url }
// Route interne protégée par un secret header.
// N'est jamais appelée depuis le client — uniquement depuis d'autres fonctions serveur.
//
// Installation requise : npm install web-push && npm install -D @types/web-push

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabase } from '@/lib/supabase';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:hello@inrealsociety.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    // ─── Protection par secret interne ───────────────────────────────────
    // Ajouter INTERNAL_SECRET dans .env.local (ex: openssl rand -hex 32)
    const secret = req.headers.get('x-internal-secret');
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    // ─── Validation ───────────────────────────────────────────────────────
    const { messageId, title, body, url } = await req.json();
    if (!messageId || !title) {
      return NextResponse.json({ error: 'messageId et title requis' }, { status: 400 });
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('message_id', messageId);

    if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 });

    const payload  = JSON.stringify({ title, body, url, tag: messageId });
    let sent       = 0;
    const expired: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 86400 },
          );
          sent++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            expired.push(sub.endpoint);
          } else {
            console.warn('[push/notify] Erreur push:', err?.message);
          }
        }
      })
    );

    if (expired.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired);
    }

    return NextResponse.json({ ok: true, sent, expired: expired.length });
  } catch (err) {
    console.error('[push/notify]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}