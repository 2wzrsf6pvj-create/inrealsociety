// src/app/api/report/route.ts
// POST { messageId, memberId } — signale un message comme inapproprié.
// Protégé : auth + ownership.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { getIp } from '@/lib/ratelimit';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
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
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    const { messageId, memberId } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    // Marque le message comme modéré (invisible pour le membre)
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ moderated: true })
      .eq('id', messageId)
      .eq('member_id', memberId);

    if (error) throw error;

    audit({
      action:   'message.reported',
      memberId,
      ip:       getIp(req),
      metadata: { messageId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/report]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
