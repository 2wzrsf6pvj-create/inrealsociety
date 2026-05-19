// src/app/api/send-email/route.ts
// POST /api/send-email { email, memberId, name }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { sendEmail, emailBienvenue } from '@/lib/email-templates';

const schema = z.object({
  email:    z.string().email(),
  memberId: z.string().uuid(),
  name:     z.string().min(1).max(100),
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

    const { email, memberId, name } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const appUrl       = process.env.NEXT_PUBLIC_APP_URL!;
    const dashboardUrl = `${appUrl}/dashboard/${memberId}`;
    const profileUrl   = `${appUrl}/?id=${memberId}`;

    const { subject, html } = emailBienvenue({ name, dashboardUrl, profileUrl });
    const ok = await sendEmail({ to: email, subject, html });

    if (!ok) return NextResponse.json({ error: 'Échec envoi email' }, { status: 500 });
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[send-email]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
