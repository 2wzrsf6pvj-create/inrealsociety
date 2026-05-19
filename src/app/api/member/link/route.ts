// src/app/api/member/link/route.ts
// POST { memberId } — lie un profil legacy (sans auth_user_id) au compte Auth connecté.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  memberId: z.string().uuid(),
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
      return NextResponse.json({ error: 'memberId invalide.' }, { status: 400 });
    }

    const { memberId } = body.data;

    // ─── Vérifie que ce user n'a pas déjà un profil ───────────────────────
    const { data: existingMember } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (existingMember) {
      return NextResponse.json({ error: 'Ce compte est déjà lié à un profil.' }, { status: 409 });
    }

    // ─── Vérifie que le membre cible est bien legacy (auth_user_id = null) ─
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, email, auth_user_id')
      .eq('id', memberId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Membre introuvable.' }, { status: 404 });
    }

    if (member.auth_user_id !== null) {
      return NextResponse.json({ error: 'Ce profil est déjà lié à un compte.' }, { status: 409 });
    }

    // ─── Sécurité : vérifie que l'email du compte Auth correspond au membre ─
    if (member.email && auth.user.email && member.email.toLowerCase() !== auth.user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Ce profil ne correspond pas à votre compte.' }, { status: 403 });
    }

    // ─── Lie le profil au compte Auth ─────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update({ auth_user_id: auth.user.id })
      .eq('id', memberId)
      .is('auth_user_id', null);

    if (updateError) {
      console.error('[api/member/link]', updateError);
      return NextResponse.json({ error: 'Erreur de liaison.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, memberId });

  } catch (err) {
    console.error('[api/member/link]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
