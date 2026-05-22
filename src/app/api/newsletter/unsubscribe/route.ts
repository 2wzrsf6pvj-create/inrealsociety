// GET /api/newsletter/unsubscribe?e=<email>&t=<token>
// Désinscription newsletter via lien signé (List-Unsubscribe + lien footer).
// Public (lien cliqué depuis un email). Idempotent.
//
// NB : l'ENVOI de newsletter n'est pas encore implémenté ; cet endpoint + le
// helper signUnsubscribe sont l'infra prête à l'emploi (le futur envoi devra
// filtrer unsubscribed_at IS NULL et poser le lien signé dans chaque email).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyUnsubscribe } from '@/lib/unsubscribe-token';
import { checkPublicRateLimit, getIp } from '@/lib/ratelimit';

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
  const rl = await checkPublicRateLimit(getIp(req));
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

  return page('Désinscription confirmée', 'Vous ne recevrez plus la newsletter. Vous pouvez vous réinscrire à tout moment.');
}
