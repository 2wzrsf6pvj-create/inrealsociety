// app/api/push/subscribe/route.ts
// POST { subscription, messageId? , memberId? } — au moins un des deux ids.
//   * messageId (thread)  → PUBLIC : un scanneur anonyme, qui possède déjà le
//     messageId non-devinable (modèle lien-capability), s'abonne à SA conv.
//   * memberId  (membre)  → AUTHENTIFIÉ + OWNERSHIP OBLIGATOIRES : s'abonner au
//     niveau membre = recevoir l'aperçu de TOUS les messages reçus + leurs
//     messageId (qui ouvrent les threads). Sans ce contrôle, n'importe qui
//     pourrait s'abonner au flux d'un porteur via son memberId public
//     (/profil/<uuid>) → fuite de confidentialité.
// onConflict:'endpoint' (unique) → un device n'a qu'UN scope à la fois.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';

// Abonnement soit au niveau thread (messageId — scanner anonyme dans une
// conversation), soit au niveau membre (memberId — porteur depuis le dashboard,
// alerté de tout nouveau message). Au moins l'un des deux est requis.
const schema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth:   z.string().min(1).max(512),
    }),
  }),
  messageId: z.string().uuid().optional(),
  memberId:  z.string().uuid().optional(),
}).refine(d => d.messageId || d.memberId, { message: 'messageId ou memberId requis' });

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
    const { subscription, messageId, memberId } = body.data;

    // Abonnement niveau membre → réservé au porteur authentifié (anti-fuite).
    if (memberId) {
      const auth = await requireAuth(req);
      if (isHttpError(auth)) return auth;
      const own = await requireOwnership(auth.user.id, memberId);
      if (isHttpError(own)) return own;
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
      endpoint:   subscription.endpoint,
      p256dh:     subscription.keys.p256dh,
      auth:       subscription.keys.auth,
      message_id: messageId ?? null,
      member_id:  memberId ?? null,
    }, { onConflict: 'endpoint' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}