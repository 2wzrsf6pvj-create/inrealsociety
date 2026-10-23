// POST /api/profile/report — signalement d'un profil, ou d'une conversation par
// le passant, par n'importe qui, sans compte. Règlement européen sur les
// services numériques (art. 16) : moyen simple de signaler un contenu, avec
// déclaration de bonne foi et accusé de réception à l'auteur qui laisse son
// email. Le signalement est tracé (audit profile.reported, gardé 24 mois) et
// envoyé à l'équipe (ADMIN_ALERT_EMAIL), qui décide : rien n'est masqué
// automatiquement.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { sendEmail, emailProfileReportAlert, emailReportReceipt } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';
import { reportError } from '@/lib/report-error';

const schema = z.object({
  memberId:  z.string().uuid(),
  // Conversation signalée par le passant (message racine) : jointe à l'alerte.
  messageId: z.string().uuid().nullish(),
  reason:    z.string().trim().min(5).max(1000),
  // Facultatif : pour que l'équipe puisse répondre. Seul usage automatique :
  // l'accusé de réception, si c'est un email.
  contact:   z.string().trim().max(200).nullish(),
  goodFaith: z.literal(true),
});

const isEmail = (value: string) => z.string().email().safeParse(value).success;

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
      const goodFaithMissing = body.error.issues.some((issue) => issue.path[0] === 'goodFaith');
      return NextResponse.json(
        { error: goodFaithMissing ? 'Cochez la case pour confirmer votre signalement.' : 'Décrivez le problème en quelques mots.' },
        { status: 400 },
      );
    }
    const { memberId, reason } = body.data;
    const contact = body.data.contact || null;

    const { data: member } = await supabaseAdmin
      .from('members').select('id, name').eq('id', memberId).maybeSingle();
    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // Conversation jointe seulement si elle concerne bien ce porteur.
    let messageId: string | null = null;
    if (body.data.messageId) {
      const { data: root } = await supabaseAdmin
        .from('messages').select('id')
        .eq('id', body.data.messageId).eq('member_id', memberId).is('parent_id', null)
        .maybeSingle();
      messageId = root?.id ?? null;
    }

    // Tracé d'abord : sans ADMIN_ALERT_EMAIL, le signalement n'est pas perdu.
    audit({ action: 'profile.reported', memberId, ip, metadata: { reason, contact, messageId } });

    // Alerte attendue (pas en tâche de fond) : une fonction serverless peut
    // s'arrêter dès la réponse envoyée, et cette alerte est le seul signal.
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      const { subject, html } = emailProfileReportAlert({
        memberName: member.name ?? null,
        memberId,
        profileUrl: `${APP_URL}/profil/${memberId}`,
        conversationUrl: messageId ? `${APP_URL}/conversation/${messageId}` : null,
        reason,
        contact,
      });
      const sent = await sendEmail({ to: adminEmail, subject, html });
      if (!sent) console.error('[api/profile/report] alerte email non envoyée');
    } else {
      console.warn('[api/profile/report] ADMIN_ALERT_EMAIL absent : personne n\'est prévenu du signalement');
    }

    // Accusé de réception (art. 16, paragraphe 4) : seulement vers un email.
    let receiptSent = false;
    if (contact && isEmail(contact)) {
      const { subject, html } = emailReportReceipt();
      receiptSent = await sendEmail({ to: contact, subject, html }).catch(() => false);
    }

    return NextResponse.json({ ok: true, receiptSent });
  } catch (err) {
    reportError('api/profile/report', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
