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

function page(title: string, msg: string, extra = ''): NextResponse {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
.box{max-width:22rem}h1{font-weight:300;font-size:1.6rem;margin:0 0 .5rem}p{color:rgba(255,255,255,.5);font-size:.9rem;line-height:1.6}a{color:rgba(255,255,255,.8)}
button{margin-top:1rem;padding:12px 20px;background:#fff;color:#000;border:0;border-radius:2px;font:inherit;font-weight:700;letter-spacing:.15em;text-transform:uppercase;font-size:.75rem;cursor:pointer}</style>
</head><body><div class="box"><h1>${title}</h1><p>${msg}</p>${extra}<p><a href="/">← In Real Society</a></p></div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

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
