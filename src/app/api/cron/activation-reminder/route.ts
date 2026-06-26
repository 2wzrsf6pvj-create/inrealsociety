// GET /api/cron/activation-reminder
// Relance les comptes confirmés SANS profil (acheteur qui a payé + créé son compte
// mais abandonné l'étape profil → t-shirt jamais fabriqué, le fulfillment attend
// l'inscription). UNE relance par compte (table profile_completion_reminders).
//
// Protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { sendEmail, emailProfileReminder } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fonction SECURITY DEFINER (migration 044) : auth.users confirmés, sans member,
  // créés il y a 2 h–7 j, pas encore relancés. Plafonnée à 200/run côté SQL.
  const { data: accounts, error } = await supabaseAdmin.rpc('accounts_pending_profile');
  if (error) {
    console.error('[cron/activation-reminder]', error);
    return NextResponse.json({ error: 'Erreur SQL.' }, { status: 500 });
  }

  const registerUrl = `${APP_URL}/register`;
  let sent = 0, failed = 0;

  for (const a of accounts ?? []) {
    if (!a.email) continue;
    const { subject, html } = emailProfileReminder({ registerUrl });
    try {
      // sendEmail renvoie false (sans throw) → on ne marque « relancé » QUE si
      // l'envoi a réussi, sinon la relance serait perdue (marquée, jamais reçue).
      const ok = await sendEmail({ to: a.email, subject, html });
      if (ok) {
        await supabaseAdmin
          .from('profile_completion_reminders')
          .upsert({ auth_user_id: a.auth_user_id }, { onConflict: 'auth_user_id', ignoreDuplicates: true });
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error('[cron/activation-reminder] failed for', a.auth_user_id, err);
      failed++;
    }
  }

  console.log('[cron/activation-reminder] sent:', sent, 'failed:', failed, 'candidates:', accounts?.length ?? 0);
  return NextResponse.json({ ok: true, sent, failed, total: accounts?.length ?? 0 });
}
