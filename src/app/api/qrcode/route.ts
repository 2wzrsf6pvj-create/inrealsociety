// app/api/qrcode/route.ts
// POST /api/qrcode { memberId }
// Génère un QR code pour un membre, l'upload dans Supabase Storage,
// et retourne l'URL publique.
//
// Nécessite : npm install qrcode @types/qrcode

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    // ─── Vérification auth ────────────────────────────────────────────────
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    const { memberId } = await req.json() as { memberId?: string };
    if (!memberId) {
      return NextResponse.json({ error: 'memberId requis.' }, { status: 400 });
    }

    // ─── Fix IDOR : le membre authentifié ne peut générer que SON QR code ─
    if (memberId !== user.id) {
      return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
    }

    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
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

    // ─── URL publique ──────────────────────────────────────────────────────
    const { data: { publicUrl } } = supabase.storage
      .from('qrcodes')
      .getPublicUrl(filePath);

    // ─── Sauvegarde dans la table members (colonne dédiée) ────────────────
    // ⚠️ Utiliser une colonne `qr_code_url` dédiée, pas `photo_url`
    // Migration SQL : ALTER TABLE members ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
    await supabase
      .from('members')
      .update({ qr_code_url: publicUrl })
      .eq('id', memberId);

    return NextResponse.json({ qrCodeUrl: publicUrl });

  } catch (err) {
    console.error('[api/qrcode]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}