// GET /api/cron/scan-reminders
// Envoie un email de relance aux membres qui ont activé leur profil il y a >7 jours
// mais n'ont reçu aucun scan. Idempotent via la colonne scan_reminder_sent_at.
//
// Protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailScanReminder } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';

const BATCH_SIZE = 50; // garde-fou contre un run qui partirait en vrille

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
                 ?? req.headers.get('x-cron-secret');
  return provided === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabaseAdmin
    .from('members')
    .select('id, name, email')
    .eq('scan_count', 0)
    .eq('is_paused', false)
    .is('scan_reminder_sent_at', null)
    .not('email', 'is', null)
    .lt('created_at', sevenDaysAgo)
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[cron/scan-reminders]', error);
    return NextResponse.json({ error: 'Erreur SQL.' }, { status: 500 });
  }

  let sent  = 0;
  let failed = 0;
  const dashboardUrl = `${APP_URL}/dashboard`;

  for (const m of candidates ?? []) {
    if (!m.email) continue;
    const { subject, html } = emailScanReminder({ name: m.name, dashboardUrl });
    try {
      // sendEmail renvoie false (sans throw) en cas d'échec → on ne marque
      // `scan_reminder_sent_at` QUE si l'envoi a réussi, sinon la relance était
      // perdue en silence (marquée envoyée mais jamais reçue, jamais retentée).
      const ok = await sendEmail({ to: m.email, subject, html });
      if (ok) {
        await supabaseAdmin
          .from('members')
          .update({ scan_reminder_sent_at: new Date().toISOString() })
          .eq('id', m.id);
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error('[cron/scan-reminders] failed for', m.id, err);
      failed++;
    }
  }

  console.log('[cron/scan-reminders] sent:', sent, 'failed:', failed, 'candidates:', candidates?.length ?? 0);

  return NextResponse.json({ ok: true, sent, failed, total: candidates?.length ?? 0 });
}
