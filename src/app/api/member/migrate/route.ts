// src/app/api/member/migrate/route.ts
// POST — envoie les emails de migration aux membres legacy.
// À appeler une seule fois via curl avec le secret admin.
// curl -X POST https://ton-domaine.com/api/member/migrate \
//   -H "x-admin-secret: <ADMIN_SECRET>"

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email-templates';
import { escapeHtml } from '@/lib/escape-html';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const { data: legacyMembers, error } = await supabaseAdmin
    .from('members')
    .select('id, name, email')
    .is('auth_user_id', null)
    .not('email', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!legacyMembers?.length) return NextResponse.json({ ok: true, sent: 0 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  let sent = 0;

  for (const member of legacyMembers) {
    if (!member.email) continue;
    const safeName   = escapeHtml(member.name);
    const migrateUrl = `${appUrl}/migrate?memberId=${member.id}`;

    const ok = await sendEmail({
      to:      member.email,
      subject: `${safeName}, sécurisez votre profil InRealSociety.`,
      html: `
        <div style="background:#000;color:#fff;font-family:Georgia,serif;padding:48px 32px;max-width:480px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:40px;">
            <div style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.3);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
              <span style="font-size:20px;font-weight:300;">✦</span>
            </div>
            <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.3em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0;">In Real Society</p>
          </div>
          <h1 style="font-size:24px;font-weight:300;text-align:center;margin:0 0 16px;">${safeName}, une action est requise.</h1>
          <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 32px;">
            Pour renforcer la sécurité de votre profil, créez un mot de passe et liez votre compte. Cela prend moins d'une minute.
          </p>
          <a href="${migrateUrl}" style="display:block;background:#fff;color:#000;text-align:center;padding:16px;font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;text-decoration:none;">
            Sécuriser mon profil
          </a>
        </div>
      `,
    });
    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, sent, total: legacyMembers.length });
}