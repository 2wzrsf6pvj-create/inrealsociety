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

    try {
      const rl = await checkAuthRateLimit(auth.user.id);
      if (!rl.success) {
        return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
      }
    } catch (rlErr) {
      // Rate limiting indisponible (Redis down) — on laisse passer
      console.warn('[api/member/create] Rate limit unavailable:', rlErr);
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { name, pitch, instagram, activationCode } = body.data;

    // ─── Génère un code court unique pour l'URL du QR code ─────────────────
    let shortCode: string | null = null;
    try {
      shortCode = await generateUniqueShortCode();
    } catch (scErr) {
      console.warn('[api/member/create] Short code generation failed:', scErr);
    }

    // ─── Création atomique : consomme le code + crée le membre en une transaction
    interface CreateMemberResult {
      member_id: string | null;
      already_exists: boolean;
      error_message: string | null;
    }

    const { data, error: rpcError } = await supabaseAdmin
      .rpc('create_member_with_code', {
        p_auth_user_id: auth.user.id,
        p_code:         activationCode,
        p_name:         name,
        p_pitch:        pitch,
        p_email:        auth.user.email || null,
        p_instagram:    instagram?.trim().replace(/^@/, '') || null,
        p_short_code:   shortCode,
      })
      .single();

    const result = data as unknown as CreateMemberResult;

    if (rpcError) {
      console.error('[api/member/create] RPC error:', rpcError);
      return NextResponse.json({ error: 'Erreur création profil.' }, { status: 500 });
    }

    if (result.error_message) {
      return NextResponse.json({ error: result.error_message }, { status: 400 });
    }

    if (result.already_exists) {
      return NextResponse.json({ memberId: result.member_id, alreadyExists: true });
    }

    return NextResponse.json({ memberId: result.member_id });

  } catch (err) {
    console.error('[api/member/create]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
