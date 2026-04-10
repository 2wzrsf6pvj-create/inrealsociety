// app/api/push/subscribe/route.ts
// POST { subscription: PushSubscription, messageId: string }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth:   z.string().min(1).max(512),
    }),
  }),
  messageId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const rl = await checkPublicRateLimit(ip);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }
    const { subscription, messageId } = body.data;

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
      endpoint:   subscription.endpoint,
      p256dh:     subscription.keys.p256dh,
      auth:       subscription.keys.auth,
      message_id: messageId,
    }, { onConflict: 'endpoint' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}