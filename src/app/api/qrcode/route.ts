// app/api/qrcode/route.ts
// POST /api/qrcode { memberId }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
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
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }
    const { memberId } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const appUrl     = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error('[api/qrcode] NEXT_PUBLIC_APP_URL non défini');
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }
    const profileUrl = `${appUrl}/?id=${memberId}`;

    // ─── Génération du QR code en PNG (Buffer) ────────────────────────────
    const qrBuffer = await QRCode.toBuffer(profileUrl, {
      type:                 'png',
      width:                1200,
      margin:               2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });

    // ─── Upload dans Supabase Storage ─────────────────────────────────────
    const supabase = createClient();
    const filePath = `${memberId}/qrcode.png`;

    const { error: uploadError } = await supabase.storage
      .from('qrcodes')
      .upload(filePath, qrBuffer, {
        contentType: 'image/png',
        upsert:      true,
      });

    if (uploadError) {
      console.error('[api/qrcode] Upload error:', uploadError.message);
      return NextResponse.json({ error: 'Erreur upload Storage.' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('qrcodes')
      .getPublicUrl(filePath);

    await supabaseAdmin
      .from('members')
      .update({ qr_code_url: publicUrl })
      .eq('id', memberId);

    return NextResponse.json({ qrCodeUrl: publicUrl });

  } catch (err) {
    console.error('[api/qrcode]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
