// POST /api/newsletter { email, source? }
// Capture les inscriptions newsletter. Anti-énumération : retourne toujours
// { ok: true } (même si l'email existe déjà ou si erreur de validation).
//
// RGPD : stocke email + ip + consented_at comme preuve de consentement.
// Le visiteur s'inscrit volontairement via un formulaire — distinct du consent
// cookie analytics et du marketing_consent des membres.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  email:  z.string().email().max(320),
  source: z.string().max(50).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const rl = await checkPublicRateLimit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Trop de requêtes.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ ok: true });

    const { email, source } = body.data;

    // upsert avec ignoreDuplicates : si déjà inscrit (UNIQUE email), on ignore
    // silencieusement (cas d'un user qui s'inscrit deux fois, ou d'un attaquant
    // qui sonde l'existence d'emails)
    await supabaseAdmin.from('newsletter_subscribers').upsert(
      { email: email.toLowerCase(), source: source ?? null, ip },
      { onConflict: 'email', ignoreDuplicates: true },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/newsletter]', err);
    return NextResponse.json({ ok: true });
  }
}
