// src/app/api/star-message/route.ts
// POST { messageId, starred, memberId }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
  starred:   z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    const { messageId, memberId, starred } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const { error } = await supabaseAdmin
      .from('messages')
      .update({ starred: Boolean(starred) })
      .eq('id', messageId)
      .eq('member_id', memberId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/star-message]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
