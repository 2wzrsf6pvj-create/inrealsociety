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
// DELETE { endpoint } — déconnexion du porteur : cet appareil ne reçoit plus
//   rien. Sans session (elle peut avoir expiré) : l'endpoint, que seuls cet
//   appareil et le serveur connaissent, désigne l'abonnement.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { reportError } from '@/lib/report-error';

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

// L'endpoint est stocké puis POSTé par webpush.sendNotification → on n'accepte que
// les hôtes des vrais services de push (sinon un endpoint arbitraire = primitive
// SSRF sortante). Suffixes larges pour couvrir toutes les régions/navigateurs.
const ALLOWED_PUSH_HOST_SUFFIXES = ['googleapis.com', 'mozilla.com', 'windows.com', 'apple.com'];
function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return ALLOWED_PUSH_HOST_SUFFIXES.some(s => host === s || host.endsWith('.' + s));
  } catch {
    return false;
  }
}

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

    // N'accepte que les endpoints des vrais services de push (anti-SSRF sortant).
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      return NextResponse.json({ error: 'Endpoint de push non supporté.' }, { status: 400 });
    }

    // Abonnement niveau membre → réservé au porteur authentifié (anti-fuite).
    if (memberId) {
      const auth = await requireAuth(req);
      if (isHttpError(auth)) return auth;
      const own = await requireOwnership(auth.user.id, memberId);
      if (isHttpError(own)) return own;
    } else {
      // Chemin PUBLIC (thread) : ne pas laisser un appel non-authentifié RÉÉCRIRE un
      // abonnement déjà lié à un MEMBRE (le hijack via onConflict:'endpoint' aurait
      // repointé member_id→null + message_id vers un thread choisi). On refuse
      // silencieusement d'écraser un scope membre existant.
      const { data: existing } = await supabaseAdmin
        .from('push_subscriptions').select('member_id').eq('endpoint', subscription.endpoint).maybeSingle();
      if (existing?.member_id) {
        return NextResponse.json({ ok: true });
      }
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
      endpoint:   subscription.endpoint,
      p256dh:     subscription.keys.p256dh,
      auth:       subscription.keys.auth,
      message_id: messageId ?? null,
      member_id:  memberId ?? null,
      // Date du dernier abonnement : un appareil garde le même endpoint d'une
      // conversation à l'autre, et la purge des passants (90 jours) partait de
      // la première, emportant l'abonnement à une conversation toute récente.
      created_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError('push/subscribe', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

export async function DELETE(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(getIp(req));
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = unsubscribeSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', body.data.endpoint);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError('push/unsubscribe', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}