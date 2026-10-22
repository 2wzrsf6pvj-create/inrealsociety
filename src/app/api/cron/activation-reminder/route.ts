// GET /api/cron/activation-reminder
// Deux relances « activez votre profil », dans le même cron quotidien :
//
// A. COMPTES confirmés SANS profil (acheteur qui a créé son compte mais abandonné
//    l'étape profil). UNE relance par compte (table profile_completion_reminders).
// B. COMMANDES payées dont le code n'a JAMAIS servi (acheteur qui n'a même pas créé
//    de compte). Depuis l'impression au paiement, son t-shirt part quand même et
//    chaque scan tombe sur « pas encore activé ». Au plus 2 relances (J+2, J+7 —
//    règle dans lib/order-reminders.ts), comptées sur la commande (migration 055).
//
// Les deux parties sont indépendantes : un échec de B (ex. 055 pas encore
// appliquée) n'empêche pas A.
//
// Protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { sendEmail, emailProfileReminder, emailOrderActivationReminder } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';
import {
  isOrderReminderDue, FIRST_REMINDER_AFTER_DAYS, REMINDER_WINDOW_DAYS, MAX_ORDER_REMINDERS,
} from '@/lib/order-reminders';

const ORDER_BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ─── A. Comptes sans profil ───────────────────────────────────────────────
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

  // ─── B. Commandes payées jamais activées ──────────────────────────────────
  const orders = await remindUnactivatedOrders();

  console.log('[cron/activation-reminder] accounts sent:', sent, 'failed:', failed,
    '| orders sent:', orders.sent, 'failed:', orders.failed, orders.error ? `error: ${orders.error}` : '');
  return NextResponse.json({ ok: true, sent, failed, total: accounts?.length ?? 0, orders });
}

async function remindUnactivatedOrders(): Promise<{ sent: number; failed: number; candidates: number; error?: string }> {
  const now = Date.now();
  const { data: rows, error } = await supabaseAdmin
    .from('orders')
    .select('id, email, activation_code, created_at, activation_reminders_sent, activation_reminder_at')
    .eq('status', 'paid')
    .not('activation_code', 'is', null)
    .lt('activation_reminders_sent', MAX_ORDER_REMINDERS)
    .lte('created_at', new Date(now - FIRST_REMINDER_AFTER_DAYS * DAY_MS).toISOString())
    .gte('created_at', new Date(now - REMINDER_WINDOW_DAYS * DAY_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(ORDER_BATCH);
  if (error) {
    // Ex. migration 055 pas encore appliquée : on n'emporte pas la partie A avec.
    console.error('[cron/activation-reminder] orders:', error.message);
    return { sent: 0, failed: 0, candidates: 0, error: error.message };
  }

  const due = (rows ?? []).filter(o => o.email && isOrderReminderDue(o, now));
  if (!due.length) return { sent: 0, failed: 0, candidates: 0 };

  // Code déjà consommé = profil activé → pas de relance.
  const { data: codes } = await supabaseAdmin
    .from('activation_codes')
    .select('code, used')
    .in('code', due.map(o => o.activation_code as string));
  const used = new Set((codes ?? []).filter(c => c.used).map(c => c.code));
  const known = new Set((codes ?? []).map(c => c.code));

  let sent = 0, failed = 0;
  for (const o of due) {
    const code = o.activation_code as string;
    // Code inconnu (supprimé : purge 90 j, remboursement) → rien à activer.
    if (used.has(code) || !known.has(code)) continue;

    const reminderNumber = (o.activation_reminders_sent + 1) as 1 | 2;
    const { subject, html } = emailOrderActivationReminder({
      code,
      registerUrl: `${APP_URL}/register?code=${encodeURIComponent(code)}`,
      reminderNumber,
    });
    try {
      const ok = await sendEmail({ to: o.email as string, subject, html });
      if (!ok) { failed++; continue; }
      // Verrou optimiste sur le compteur : deux runs concurrents ne comptent pas
      // (ni ne renvoient, au run suivant) la même relance deux fois.
      await supabaseAdmin
        .from('orders')
        .update({ activation_reminders_sent: reminderNumber, activation_reminder_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('activation_reminders_sent', o.activation_reminders_sent);
      sent++;
    } catch (err) {
      console.error('[cron/activation-reminder] order failed', o.id, err);
      failed++;
    }
  }
  return { sent, failed, candidates: due.length };
}
