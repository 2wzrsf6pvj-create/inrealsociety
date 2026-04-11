// POST /api/feedback
// Enregistre un retour : conversation (rating) ou app (message libre).
// Accessible aux membres authentifiés ET aux scanners anonymes (conversation feedback).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  type:      z.enum(['conversation', 'app']),
  rating:    z.enum(['positive', 'neutral', 'negative']).optional(),
  message:   z.string().max(2000).optional(),
  memberId:  z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
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
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { type, rating, message, memberId, messageId } = body.data;

    // Validation métier
    if (type === 'conversation' && !rating) {
      return NextResponse.json({ error: 'Rating requis pour un feedback conversation.' }, { status: 400 });
    }
    if (type === 'app' && !message?.trim()) {
      return NextResponse.json({ error: 'Message requis pour un feedback app.' }, { status: 400 });
    }

    // Empêche les doublons de feedback conversation (1 par message)
    if (type === 'conversation' && messageId) {
      const { data: existing } = await supabaseAdmin
        .from('feedback')
        .select('id')
        .eq('type', 'conversation')
        .eq('message_id', messageId)
        .single();

      if (existing) {
        return NextResponse.json({ ok: true, alreadySubmitted: true });
      }
    }

    const { error: insertError } = await supabaseAdmin.from('feedback').insert({
      type,
      rating:     rating || null,
      message:    message?.trim() || null,
      member_id:  memberId || null,
      message_id: messageId || null,
      metadata:   { ip },
    });

    if (insertError) throw insertError;

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[api/feedback]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
