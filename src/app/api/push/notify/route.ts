// src/app/api/push/notify/route.ts
// POST { messageId, title, body, url }
// Route interne protégée par un secret header.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';

const schema = z.object({
  messageId: z.string().uuid(),
  title:     z.string().min(1).max(200),
  body:      z.string().max(1000).optional(),
  url:       z.string().url().max(2048).optional(),
});

// Initialisation lazy — évite le crash au build si les variables sont absentes
let vapidInitialized = false;
function initVapid() {
  if (vapidInitialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY requis');
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hello@inrealsociety.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidInitialized = true;
}

export async function POST(req: NextRequest) {
  try {
    // ─── Protection par secret interne ───────────────────────────────────
    const secret = req.headers.get('x-internal-secret');
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    // ─── Validation ───────────────────────────────────────────────────────
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }
    const { messageId, title, body, url } = parsed.data;

    // ─── Init VAPID ───────────────────────────────────────────────────────
    initVapid();

    const { data: subs } = await supabaseAdmin
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
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            expired.push(sub.endpoint);
          } else {
            console.warn('[push/notify] Erreur push:', err instanceof Error ? err.message : err);
          }
        }
      })
    );

    if (expired.length) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', expired);
    }

    return NextResponse.json({ ok: true, sent, expired: expired.length });
  } catch (err) {
    console.error('[push/notify]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}