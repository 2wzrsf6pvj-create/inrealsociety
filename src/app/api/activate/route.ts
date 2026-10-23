// src/app/api/activate/route.ts
// POST { code } — valide un code d'activation côté serveur.
// Utilise le service role pour lire activation_codes (table sans policy publique).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { reportError } from '@/lib/report-error';

const schema = z.object({
  code: z.string().min(6).max(12).toUpperCase(),
});

export async function POST(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(getIp(req));
    if (!rl.success) {
      return NextResponse.json(
        { valid: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ valid: false, error: 'Code invalide.' }, { status: 400 });
    }

    const { code } = body.data;

    const { data } = await supabaseAdmin
      .from('activation_codes')
      .select('code, used')
      .eq('code', code)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ valid: false, error: 'Code introuvable.' });
    }
    if (data.used) {
      return NextResponse.json({ valid: false, error: 'Ce code a déjà été utilisé.' });
    }

    return NextResponse.json({ valid: true });
  } catch (err) {
    reportError('api/activate', err);
    return NextResponse.json({ valid: false, error: 'Erreur serveur.' }, { status: 500 });
  }
}