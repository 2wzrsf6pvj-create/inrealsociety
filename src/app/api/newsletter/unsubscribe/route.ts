// GET /api/newsletter/unsubscribe?e=<email>&t=<token>
// Désinscription newsletter via lien signé (List-Unsubscribe + lien footer).
// Public (lien cliqué depuis un email). Idempotent.
//
// Deux surfaces de consentement marketing existent pour un même email :
//   1. newsletter_subscribers.unsubscribed_at (capture publique)
//   2. members.marketing_consent              (toggle dashboard membre)
// Une désinscription DOIT couper les deux, sinon le membre reste mailable via
// l'autre canal. Ce endpoint coupe (1) ET propage à (2). Réciproquement, le
// toggle dashboard (/api/member/update) propage vers (1).
//
// NB : l'ENVOI de newsletter n'est pas encore implémenté. Le futur envoi devra
// cibler : newsletter_subscribers (unsubscribed_at IS NULL) ∪ members
// (marketing_consent = true), en posant le lien signé dans chaque email.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyUnsubscribe } from '@/lib/unsubscribe-token';
import { checkPublicRateLimit, getIp } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { actionPage as page } from '@/lib/action-page';

// Désinscription effective (newsletter + réconciliation members). Partagée entre
// le GET (lien footer cliqué) et le POST (one-click RFC 8058 des clients mail).
async function applyUnsubscribe(email: string, ip: string): Promise<void> {
  await supabaseAdmin
    .from('newsletter_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', email);

  // Réconciliation : si cet email est aussi un membre, on retire son
  // marketing_consent — sinon il resterait mailable via members malgré le clic
  // « se désinscrire ». members.email n'est pas UNIQUE → on gère N lignes. On
  // trace chaque retrait (preuve RGPD art. 7).
  const { data: members } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('email', email)
    .eq('marketing_consent', true);

  if (members && members.length > 0) {
    await supabaseAdmin
      .from('members')
      .update({ marketing_consent: false, marketing_consent_at: null })
      .eq('email', email)
      .eq('marketing_consent', true);
    for (const m of members) {
      audit({
        action:   'member.marketing_consent_changed',
        memberId: m.id,
        ip,
        metadata: { consent: false, via: 'newsletter_unsubscribe' },
      });
    }
  }
}

export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const rl = await checkPublicRateLimit(ip);
  if (!rl.success) {
    return page('Trop de requêtes', 'Réessayez dans quelques instants.');
  }

  const email = (req.nextUrl.searchParams.get('e') ?? '').trim().toLowerCase();
  const token = req.nextUrl.searchParams.get('t') ?? '';

  if (!verifyUnsubscribe(email, token)) {
    return page('Lien invalide', "Ce lien de désinscription n'est pas valide ou a expiré.");
  }

  // ⚠️ Le GET NE MUTE PAS : les scanners anti-malware et prefetchers de messagerie
  // (SafeLinks, Proofpoint…) font un GET sur les liens dès réception → une
  // désinscription au GET désinscrirait à l'insu du destinataire. On affiche une
  // page de CONFIRMATION dont le bouton POST déclenche la désinscription réelle.
  const q = `?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
  const form = `<form method="POST" action="${q}"><button type="submit">Me désinscrire</button></form>`;
  return page('Se désinscrire ?', 'Confirmez que vous ne souhaitez plus recevoir la newsletter In Real Society.', form);
}

// One-click (RFC 8058) : le client mail POST `List-Unsubscribe=One-Click` sur la
// même URL signée (header List-Unsubscribe). Idempotent, réponse 200 neutre.
export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const rl = await checkPublicRateLimit(ip);
  if (!rl.success) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const email = (req.nextUrl.searchParams.get('e') ?? '').trim().toLowerCase();
  const token = req.nextUrl.searchParams.get('t') ?? '';

  if (!verifyUnsubscribe(email, token)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await applyUnsubscribe(email, ip);
  // Réponse HTML : sert à la fois le one-click RFC 8058 (le client mail ignore le
  // corps, seul le 200 compte) ET la soumission du formulaire de confirmation
  // (humain → voit la page de succès au lieu d'un JSON brut).
  return page('Désinscription confirmée', 'Vous ne recevrez plus la newsletter. Vous pouvez vous réinscrire à tout moment.');
}
