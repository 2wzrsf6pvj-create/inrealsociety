// src/app/api/member/avatar/route.ts
// POST (FormData: file) — upload l'avatar du membre authentifié.
// Protégé : session + ownership.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    // ─── Récupère le membre lié à ce user ─────────────────────────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // ─── Parse FormData ───────────────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Format non supporté (JPEG, PNG, WebP uniquement).' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (5 Mo max).' }, { status: 400 });
    }

    // ─── Upload dans Supabase Storage ─────────────────────────────────────
    const ext      = file.name.split('.').pop() || 'jpg';
    const filePath = `${member.id}/avatar.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error('[api/member/avatar]', uploadError.message);
      return NextResponse.json({ error: 'Erreur upload.' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // ─── Met à jour le membre ─────────────────────────────────────────────
    await supabaseAdmin
      .from('members')
      .update({ photo_url: publicUrl })
      .eq('id', member.id)
      .eq('auth_user_id', auth.user.id);

    return NextResponse.json({ ok: true, photoUrl: publicUrl });

  } catch (err) {
    console.error('[api/member/avatar]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
