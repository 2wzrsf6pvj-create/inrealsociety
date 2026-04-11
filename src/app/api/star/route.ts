// src/app/api/star/route.ts
// POST { messageId, starred, memberId }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { audit } from '@/lib/audit';
import { getIp, checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
  starred:   z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { messageId, memberId, starred } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const { error, count } = await supabaseAdmin
      .from('messages')
      .update({ starred })
      .eq('id', messageId)
      .eq('member_id', memberId);

    if (error) throw error;
    if (count === 0) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    }

    audit({
      action:   'message.starred',
      memberId,
      ip:       getIp(req),
      metadata: { messageId, starred },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/star]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
