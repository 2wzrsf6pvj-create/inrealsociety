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

function page(title: string, msg: string): NextResponse {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
.box{max-width:22rem}h1{font-weight:300;font-size:1.6rem;margin:0 0 .5rem}p{color:rgba(255,255,255,.5);font-size:.9rem;line-height:1.6}a{color:rgba(255,255,255,.8)}</style>
</head><body><div class="box"><h1>${title}</h1><p>${msg}</p><p><a href="/">← In Real Society</a></p></div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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

  return page('Désinscription confirmée', 'Vous ne recevrez plus la newsletter. Vous pouvez vous réinscrire à tout moment.');
}
