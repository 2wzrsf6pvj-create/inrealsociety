// app/api/push/subscribe/route.ts
// POST { subscription: PushSubscription, messageId: string }

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { subscription, messageId } = await req.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Subscription invalide ou incomplète' }, { status: 400 });
    }

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json({ error: 'messageId requis' }, { status: 400 });
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
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