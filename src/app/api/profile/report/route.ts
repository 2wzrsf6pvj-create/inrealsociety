// POST /api/profile/report — signalement d'un profil par n'importe qui, passant
// compris, sans compte. Règlement européen sur les services numériques : tout
// hébergeur offre un moyen simple de signaler un contenu. Le signalement est
// tracé (audit profile.reported, gardé 24 mois) et envoyé à l'équipe
// (ADMIN_ALERT_EMAIL), qui décide : rien n'est masqué automatiquement.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { sendEmail, emailProfileReportAlert } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';

const schema = z.object({
  memberId: z.string().uuid(),
  reason:   z.string().trim().min(5).max(1000),
  // Facultatif : pour que l'équipe puisse répondre. Jamais utilisé automatiquement.
  contact:  z.string().trim().max(200).nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const rl = await checkPublicRateLimit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Décrivez le problème en quelques mots.' }, { status: 400 });
    }
    const { memberId, reason } = body.data;
    const contact = body.data.contact || null;

    const { data: member } = await supabaseAdmin
      .from('members').select('id, name').eq('id', memberId).maybeSingle();
    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // Tracé d'abord : sans ADMIN_ALERT_EMAIL, le signalement n'est pas perdu.
    audit({ action: 'profile.reported', memberId, ip, metadata: { reason, contact } });

    // Alerte attendue (pas en tâche de fond) : une fonction serverless peut
    // s'arrêter dès la réponse envoyée, et cette alerte est le seul signal.
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      const { subject, html } = emailProfileReportAlert({
        memberName: member.name ?? null,
        memberId,
        profileUrl: `${APP_URL}/profil/${memberId}`,
        reason,
        contact,
      });
      const sent = await sendEmail({ to: adminEmail, subject, html });
      if (!sent) console.error('[api/profile/report] alerte email non envoyée');
    } else {
      console.warn('[api/profile/report] ADMIN_ALERT_EMAIL absent : personne n\'est prévenu du signalement');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/profile/report]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
