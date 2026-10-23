// src/app/api/report/route.ts
// POST { messageId, memberId } — signale un message comme inapproprié.
// Protégé : auth + ownership.
//
// Effets : message masqué pour le porteur ; signalement enregistré (une fois par
// porteur et par appareil) ; appareil banni de toute la plateforme dès que
// REPORT_BAN_THRESHOLD porteurs différents l'ont signalé ; alerte email à
// l'équipe (ADMIN_ALERT_EMAIL). Seul le masquage est indispensable : le reste
// est en dégradation douce (migration 056 absente, email non configuré…).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { getIp } from '@/lib/ratelimit';
import { recordReport, senderTokenOf, type ReportOutcome } from '@/lib/reports';
import { sendEmail, emailReportAlert } from '@/lib/email-templates';
import { REPORT_BAN_THRESHOLD } from '@/lib/constants';
import { reportError } from '@/lib/report-error';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { messageId, memberId } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    // Marque le message comme modéré (invisible pour le membre).
    const { data: reported, error } = await supabaseAdmin
      .from('messages')
      .update({ moderated: true })
      .eq('id', messageId)
      .eq('member_id', memberId)
      .select('id, content, author, sender_token, parent_id')
      .maybeSingle();

    if (error) throw error;
    if (!reported) return NextResponse.json({ ok: true });

    // Appareil du passant (porté par le message racine) → trace d'abus et ban.
    const senderToken = await senderTokenOf(reported);

    let outcome: ReportOutcome | null = null;
    try {
      outcome = await recordReport({ messageId, memberId, senderToken });
    } catch (err) {
      // Le message est déjà masqué : on ne fait pas échouer le signalement.
      console.error('[api/report] enregistrement du signalement impossible:', err);
      audit({ action: 'message.report_failed', memberId, metadata: { messageId } });
    }

    audit({
      action:   'message.reported',
      memberId,
      ip:       getIp(req),
      // sender_token (pseudonyme) : relie un device à travers plusieurs porteurs.
      metadata: { messageId, senderToken, reporters: outcome?.reporters ?? null, banned: outcome?.banned ?? null },
    });
    if (outcome?.banned) {
      audit({ action: 'device.auto_banned', memberId, metadata: { senderToken, reporters: outcome.reporters } });
    }

    // Alerte à l'équipe. Attendue (pas en tâche de fond) : une fonction serverless
    // peut s'arrêter dès la réponse envoyée, et cette alerte est le seul signal.
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      const { data: member } = await supabaseAdmin.from('members').select('name').eq('id', memberId).maybeSingle();
      const { subject, html } = emailReportAlert({
        memberName:  member?.name ?? null,
        memberId,
        content:     reported.content ?? '',
        senderToken,
        outcome,
        threshold:   REPORT_BAN_THRESHOLD,
      });
      const sent = await sendEmail({ to: adminEmail, subject, html });
      if (!sent) console.error('[api/report] alerte email non envoyée');
    } else {
      console.warn('[api/report] ADMIN_ALERT_EMAIL absent : personne n\'est prévenu du signalement');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError('api/report', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
