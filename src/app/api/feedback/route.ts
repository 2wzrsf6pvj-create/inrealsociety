// POST /api/feedback
// Enregistre un retour : conversation (rating) ou app (message libre).
// Accessible aux membres authentifiés ET aux scanners anonymes (conversation feedback).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { getOptionalUser } from '@/lib/require-auth';
import { reportError } from '@/lib/report-error';

const schema = z.object({
  type:      z.enum(['conversation', 'app']),
  rating:    z.enum(['positive', 'neutral', 'negative']).optional(),
  message:   z.string().max(2000).optional(),
  memberId:  z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const rl = await checkPublicRateLimit(ip);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { type, rating, message, memberId, messageId } = body.data;

    // Validation métier
    if (type === 'conversation' && !rating) {
      return NextResponse.json({ error: 'Rating requis pour un feedback conversation.' }, { status: 400 });
    }
    if (type === 'app' && !message?.trim()) {
      return NextResponse.json({ error: 'Message requis pour un feedback app.' }, { status: 400 });
    }

    // Empêche les doublons de feedback conversation (1 par message). Chemin rapide ;
    // le vrai garde anti-course est l'index unique partiel (migration 051), traité
    // via le 23505 ci-dessous. maybeSingle : 0 ligne = cas normal (pas d'erreur/406).
    if (type === 'conversation' && messageId) {
      const { data: existing } = await supabaseAdmin
        .from('feedback')
        .select('id')
        .eq('type', 'conversation')
        .eq('message_id', messageId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, alreadySubmitted: true });
      }
    }

    // Avis écrit depuis « Mon espace » : rattaché au porteur connecté, jamais à
    // l'identifiant envoyé par le navigateur. Sinon n'importe qui pourrait
    // écrire au nom d'un porteur, et /admin l'afficherait comme le sien.
    let storedMemberId = memberId || null;
    if (type === 'app') {
      const user = await getOptionalUser(req);
      const { data: own } = user
        ? await supabaseAdmin.from('members').select('id').eq('auth_user_id', user.id).maybeSingle()
        : { data: null };
      storedMemberId = (own as { id: string } | null)?.id ?? null;
    }

    const { error: insertError } = await supabaseAdmin.from('feedback').insert({
      type,
      rating:     rating || null,
      message:    message?.trim() || null,
      member_id:  storedMemberId,
      message_id: messageId || null,
      metadata:   { ip },
    });

    if (insertError) {
      // Course perdue sur l'index unique partiel (deux soumissions quasi simultanées
      // pour le même message) → c'est un doublon, pas une erreur serveur.
      if (insertError.code === '23505') {
        return NextResponse.json({ ok: true, alreadySubmitted: true });
      }
      throw insertError;
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    reportError('api/feedback', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
