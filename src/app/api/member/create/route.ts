// src/app/api/member/create/route.ts
// POST { name, pitch, instagram?, activationCode }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { generateUniqueShortCode } from '@/lib/short-code';

const schema = z.object({
  name:           z.string().min(1).max(50).trim(),
  pitch:          z.string().min(1).max(500).trim(),
  instagram:      z.string().max(50).optional(),
  activationCode: z.string().min(6).max(12).toUpperCase(),
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

    const { name, pitch, instagram, activationCode } = body.data;

    // ─── Vérification code d'activation ──────────────────────────────────
    const { data: codeData } = await supabaseAdmin
      .from('activation_codes')
      .select('code, used')
      .eq('code', activationCode)
      .single();

    if (!codeData || codeData.used) {
      return NextResponse.json({ error: 'Code invalide ou déjà utilisé.' }, { status: 400 });
    }

    // ─── Vérifie si ce user a déjà un profil ─────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (existing) {
      return NextResponse.json({ memberId: existing.id, alreadyExists: true });
    }

    // ─── Génère un code court unique pour l'URL du QR code ─────────────────
    const shortCode = await generateUniqueShortCode();

    // ─── Création du membre lié au compte auth ────────────────────────────
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .insert({
        name,
        pitch,
        instagram:    instagram?.trim() || null,
        email:        auth.user.email || null,
        auth_user_id: auth.user.id,
        short_code:   shortCode,
      })
      .select('id, short_code')
      .single();

    if (memberError || !member) {
      console.error('[api/member/create]', memberError);
      return NextResponse.json({ error: 'Erreur création profil.' }, { status: 500 });
    }

    // ─── Marque le code comme utilisé ────────────────────────────────────
    await supabaseAdmin
      .from('activation_codes')
      .update({ used: true, member_id: member.id })
      .eq('code', activationCode);

    return NextResponse.json({ memberId: member.id });

  } catch (err) {
    console.error('[api/member/create]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
