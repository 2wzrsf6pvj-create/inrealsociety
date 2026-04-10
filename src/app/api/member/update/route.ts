// src/app/api/member/update/route.ts
// PATCH { name, pitch, instagram } — met à jour le profil du membre authentifié.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  name:      z.string().min(1).max(50).trim().optional(),
  pitch:     z.string().min(1).max(500).trim().optional(),
  instagram: z.string().max(50).optional(),
  is_paused: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
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

    // ─── Vérifie ownership : récupère le membre lié à ce user ────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update(body.data)
      .eq('id', member.id)
      .eq('auth_user_id', auth.user.id);

    if (updateError) {
      console.error('[api/member/update]', updateError);
      return NextResponse.json({ error: 'Erreur de mise à jour.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[api/member/update]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
