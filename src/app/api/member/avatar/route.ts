// src/app/api/member/avatar/route.ts
// POST (FormData: file) — upload l'avatar du membre authentifié.
// Protégé : session + ownership.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { reportError } from '@/lib/report-error';

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

// Détecte le VRAI type via les magic-bytes du contenu — jamais le Content-Type
// déclaré par le client (spoofable). Un fichier HTML/JS étiqueté image/png est
// alors rejeté au lieu d'être stocké/servi. (Supabase force déjà le content-type +
// X-Content-Type-Options:nosniff, mais on ne stocke pas un blob non-image du tout.)
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    // ─── Rate limit : upload de fichier coûteux (storage/bande passante) ──
    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    // ─── Récupère le membre lié à ce user ─────────────────────────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // ─── Rejet précoce sur Content-Length (avant de tout bufferiser en mémoire) ──
    // req.formData() lit tout le corps en mémoire ; on refuse d'abord un corps
    // manifestement trop gros (marge pour l'overhead multipart) avant de le parser.
    const declaredLen = Number(req.headers.get('content-length') || 0);
    if (declaredLen > MAX_SIZE + 100 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (5 Mo max).' }, { status: 413 });
    }

    // ─── Parse FormData ───────────────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier requis.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (5 Mo max).' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Type RÉEL par magic-bytes (pas le Content-Type déclaré, spoofable). Autorité
    // pour l'extension ET le content-type servi.
    const realType = sniffImageType(buffer);
    if (!realType || !ALLOWED_TYPES.includes(realType)) {
      return NextResponse.json({ error: 'Format non supporté (JPEG, PNG, WebP uniquement).' }, { status: 400 });
    }

    // ─── Upload dans Supabase Storage ─────────────────────────────────────
    // Extension + content-type dérivés du type RÉEL (magic-bytes), JAMAIS du nom de
    // fichier ni du MIME client : évite path-traversal ET contenu non-image déguisé.
    const ext      = EXT_BY_TYPE[realType] ?? 'jpg';
    const filePath = `${member.id}/avatar.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, { contentType: realType, upsert: true });

    if (uploadError) {
      reportError('api/member/avatar', uploadError.message);
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
    reportError('api/member/avatar', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
