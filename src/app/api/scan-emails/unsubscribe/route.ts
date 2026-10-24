// GET|POST /api/scan-emails/unsubscribe?m=<memberId>&t=<token>
// Coupe l'email « nouveau scan » d'un porteur (migration 061, choix de Clément).
// Lien en pied de cet email et en List-Unsubscribe (un clic, RFC 8058). Public :
// le lien signé (HMAC sur l'identifiant) tient lieu de preuve. Idempotent ; se
// réactive dans les réglages.
//
// Comme pour la newsletter, le GET ne coupe rien : les scanners de liens des
// messageries le suivent dès réception. Il affiche une confirmation dont le
// bouton envoie le POST, celui que font aussi les clients mail en un clic.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyScanEmailsOptOut } from '@/lib/unsubscribe-token';
import { checkPublicRateLimit, getIp } from '@/lib/ratelimit';
import { actionPage } from '@/lib/action-page';

const schema = z.object({ m: z.string().uuid(), t: z.string().min(1).max(64) });

/** Le lien s'il est valide et signé, sinon null. */
function signedLink(req: NextRequest): z.infer<typeof schema> | null {
  const parsed = schema.safeParse({
    m: req.nextUrl.searchParams.get('m'),
    t: req.nextUrl.searchParams.get('t'),
  });
  if (!parsed.success || !verifyScanEmailsOptOut(parsed.data.m, parsed.data.t)) return null;
  return parsed.data;
}

export async function GET(req: NextRequest) {
  if (!(await checkPublicRateLimit(getIp(req))).success) {
    return actionPage('Trop de requêtes', 'Réessayez dans quelques instants.');
  }
  const link = signedLink(req);
  if (!link) {
    return actionPage('Lien invalide', "Ce lien n’est pas valide.");
  }
  // Reconstruit depuis les seules valeurs vérifiées : jamais la query brute,
  // qui peut porter d'autres paramètres, dans le HTML.
  const q = `?m=${encodeURIComponent(link.m)}&t=${encodeURIComponent(link.t)}`;
  const form = `<form method="POST" action="${q}"><button type="submit">Ne plus les recevoir</button></form>`;
  return actionPage(
    'Emails de scan',
    "Vous ne recevrez plus d’email quand quelqu’un scanne votre profil. Les scans restent dans votre tableau de bord, et vous pourrez réactiver ces emails dans vos réglages.",
    form,
  );
}

export async function POST(req: NextRequest) {
  if (!(await checkPublicRateLimit(getIp(req))).success) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const link = signedLink(req);
  if (!link) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('members').update({ scan_emails: false }).eq('id', link.m);
  if (error) {
    // Typiquement : migration 061 pas encore appliquée.
    console.error('[scan-emails/unsubscribe]', error.message);
    return actionPage(
      'Impossible pour le moment',
      'Réessayez plus tard, ou écrivez à <a href="mailto:hello@inrealsociety.com">hello@inrealsociety.com</a>.',
      '',
      503,
    );
  }
  // Page lisible pour le bouton de confirmation ; le client mail du one-click
  // ne regarde que le statut 200.
  return actionPage('C’est noté', "Vous ne recevrez plus d’email à chaque scan. Pour les réactiver\u00a0: réglages de votre tableau de bord.");
}
