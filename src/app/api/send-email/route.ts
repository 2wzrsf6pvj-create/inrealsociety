// src/app/api/send-email/route.ts
// POST /api/send-email { email, memberId, name }
// ⚠️ Route protégée par vérification de session Supabase.
// Seul un utilisateur authentifié peut déclencher l'envoi de l'email de bienvenue.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { sendEmail, emailBienvenue } from '@/lib/email-templates';

const schema = z.object({
  email:    z.string().email(),
  memberId: z.string().uuid(),
  name:     z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    // ─── Vérification session Supabase ────────────────────────────────────
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return req.cookies.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {
            res.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            res.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    // ─── Validation ───────────────────────────────────────────────────────
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    const { email, memberId, name } = body.data;
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