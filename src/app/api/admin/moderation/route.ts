// src/app/api/admin/moderation/route.ts
// POST — décisions prises depuis /admin : modération, et renvoi d'un code
// d'activation (service client).
// Réservé à ADMIN_EMAILS (adresse confirmée) ; pour tout autre compte, 404 sans
// rien révéler. Chaque décision s'inscrit dans audit_logs (qui, quoi, pourquoi),
// clôt le signalement d'où elle part, et prévient par email la personne visée
// et l'auteur du signalement quand c'est possible (règlement européen sur les
// services numériques, art. 16 et 17).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { isAdmin } from '@/lib/admin';
import { REPORT_KEY_RE } from '@/lib/moderation-queue';
import { sendEmail, emailActivation, emailModerationNotice, emailReportOutcome } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';
import type { AuditAction } from '@/lib/audit';
import { reportError } from '@/lib/report-error';

const motif     = z.string().trim().min(3).max(500);
const reportKey = z.string().regex(REPORT_KEY_RE);
const fromReport = { reportKey: reportKey.optional(), notifyReporter: z.boolean().default(false) };

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend_member'),   memberId: z.string().uuid(), motif, ...fromReport }),
  z.object({ action: z.literal('unsuspend_member'), memberId: z.string().uuid() }),
  z.object({ action: z.literal('remove_photo'),     memberId: z.string().uuid(), motif, ...fromReport }),
  z.object({ action: z.literal('ban_device'),       senderToken: z.string().uuid(), motif, ...fromReport }),
  z.object({ action: z.literal('unban_device'),     senderToken: z.string().uuid() }),
  z.object({ action: z.literal('hide_message'),     messageId: z.string().uuid(), motif, ...fromReport }),
  z.object({ action: z.literal('mark_handled'),     reportKey, decision: motif, notifyReporter: z.boolean().default(false) }),
  z.object({ action: z.literal('resend_code'),      orderId: z.string().uuid() }),
]);
type Decision = z.infer<typeof schema>;

/** Ce que l'auteur du signalement apprend de la suite donnée. */
const OUTCOME: Record<Exclude<Decision['action'], 'mark_handled' | 'unsuspend_member' | 'unban_device' | 'resend_code'>, string> = {
  suspend_member: 'le profil signalé a été suspendu.',
  remove_photo:   'la photo signalée a été retirée.',
  ban_device:     'l’appareil à l’origine des messages ne peut plus écrire sur In Real Society.',
  hide_message:   'le message signalé a été masqué.',
};

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

class NotFound extends Error {}
class Conflict extends Error {}

/** Trace écrite AVANT de répondre : c'est aussi l'état « traité » de /admin. */
async function record(action: AuditAction, memberId: string | null, metadata: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('audit_logs').insert({ action, member_id: memberId, metadata });
  if (error) throw error;
}

async function getMember(memberId: string) {
  const { data, error } = await supabaseAdmin
    .from('members').select('id, name, email').eq('id', memberId).maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound();
  return data as { id: string; name: string | null; email: string | null };
}

async function notifyMember(
  member: { name: string | null; email: string | null },
  kind: 'suspended' | 'photo_removed' | 'unsuspended',
  why: string | null,
): Promise<boolean> {
  if (!member.email) return false;
  const { subject, html } = emailModerationNotice({ name: member.name, kind, motif: why, date: DATE.format(new Date()) });
  return sendEmail({ to: member.email, subject, html }).catch(() => false);
}

/** Auteur d'un signalement de profil ou de conversation, s'il a laissé un email. */
async function notifyReporter(key: string, decision: string): Promise<boolean> {
  if (!key.startsWith('profile:')) return false;
  const { data } = await supabaseAdmin
    .from('audit_logs').select('metadata').eq('id', key.slice('profile:'.length)).maybeSingle();
  const contact = (data?.metadata as { contact?: unknown } | null)?.contact;
  if (typeof contact !== 'string' || !z.string().email().safeParse(contact).success) return false;
  const { subject, html } = emailReportOutcome({ decision });
  return sendEmail({ to: contact, subject, html }).catch(() => false);
}

/** memberNotified : null quand la décision ne vise pas un porteur ;
 *  buyerNotified : seulement pour le renvoi d'un code d'activation. */
async function apply(d: Decision, by: string): Promise<{ memberNotified: boolean | null; buyerNotified?: boolean }> {
  switch (d.action) {
    case 'suspend_member': {
      const member = await getMember(d.memberId);
      const { error } = await supabaseAdmin.from('members')
        .update({ suspended_at: new Date().toISOString(), is_paused: true }).eq('id', d.memberId);
      if (error) throw error;
      await record('member.suspended', d.memberId, { by, motif: d.motif, source: 'moderation' });
      return { memberNotified: await notifyMember(member, 'suspended', d.motif) };
    }
    case 'unsuspend_member': {
      const member = await getMember(d.memberId);
      const { error } = await supabaseAdmin.from('members')
        .update({ suspended_at: null, is_paused: false }).eq('id', d.memberId);
      if (error) throw error;
      await record('member.unsuspended', d.memberId, { by });
      return { memberNotified: await notifyMember(member, 'unsuspended', null) };
    }
    case 'remove_photo': {
      const member = await getMember(d.memberId);
      const { error } = await supabaseAdmin.from('members').update({ photo_url: null }).eq('id', d.memberId);
      if (error) throw error;
      // Le fichier aussi : son adresse publique resterait sinon accessible.
      const { error: storageErr } = await supabaseAdmin.storage.from('avatars')
        .remove(['jpg', 'png', 'webp'].map((ext) => `${d.memberId}/avatar.${ext}`));
      if (storageErr) console.error('[api/admin/moderation] fichier de la photo non supprimé :', storageErr.message);
      await record('member.photo_removed', d.memberId, { by, motif: d.motif });
      return { memberNotified: await notifyMember(member, 'photo_removed', d.motif) };
    }
    case 'ban_device': {
      const { error } = await supabaseAdmin.from('banned_devices')
        .upsert({ sender_token: d.senderToken, reason: `équipe : ${d.motif}` }, { onConflict: 'sender_token' });
      if (error) throw error;
      await record('device.banned', null, { by, motif: d.motif, senderToken: d.senderToken });
      return { memberNotified: null };
    }
    case 'unban_device': {
      const { error } = await supabaseAdmin.from('banned_devices').delete().eq('sender_token', d.senderToken);
      if (error) throw error;
      await record('device.unbanned', null, { by, senderToken: d.senderToken });
      return { memberNotified: null };
    }
    case 'hide_message': {
      const { data, error } = await supabaseAdmin.from('messages')
        .update({ moderated: true }).eq('id', d.messageId).select('member_id').maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFound();
      await record('message.hidden', data.member_id as string, { by, motif: d.motif, messageId: d.messageId });
      return { memberNotified: null };
    }
    case 'mark_handled':
      return { memberNotified: null };
    case 'resend_code': {
      // Même règle que « Code perdu ? » sur /register : commande payée, code
      // jamais utilisé.
      const { data: order, error } = await supabaseAdmin.from('orders')
        .select('id, email, status, activation_code').eq('id', d.orderId).maybeSingle();
      if (error) throw error;
      if (!order || order.status !== 'paid' || !order.activation_code) throw new NotFound();
      const { data: code } = await supabaseAdmin.from('activation_codes')
        .select('used').eq('code', order.activation_code).maybeSingle();
      if (!code || code.used) throw new Conflict('Code déjà utilisé : le profil est activé.');
      const { subject, html } = emailActivation({
        code:        order.activation_code,
        registerUrl: `${APP_URL}/register?code=${order.activation_code}`,
      });
      const sent = await sendEmail({ to: order.email, subject, html }).catch(() => false);
      await record('order.email_resent', null, { by, orderId: order.id, email: order.email, sent });
      return { memberNotified: null, buyerNotified: sent };
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;
    if (!isAdmin(auth.user)) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });

    // Défense en profondeur contre une requête forgée depuis un autre site.
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: 'Origine refusée.' }, { status: 403 });
    }

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides : motif de 3 à 500 caractères.' }, { status: 400 });
    }
    const d = body.data;
    const by = auth.user.email!.toLowerCase();

    const { memberNotified, buyerNotified } = await apply(d, by);

    // Clôt le signalement d'où part la décision, puis prévient son auteur
    // (reporterNotified : null quand ce n'était pas demandé).
    let reporterNotified: boolean | null = null;
    if ('reportKey' in d && d.reportKey) {
      const decision = d.action === 'mark_handled' ? d.decision : OUTCOME[d.action];
      await record('moderation.report_handled', 'memberId' in d ? d.memberId : null, { by, reportKey: d.reportKey, decision });
      if (d.notifyReporter) reporterNotified = await notifyReporter(d.reportKey, decision);
    }

    return NextResponse.json({ ok: true, memberNotified, reporterNotified, ...(buyerNotified === undefined ? {} : { buyerNotified }) });
  } catch (err) {
    if (err instanceof NotFound) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
    if (err instanceof Conflict) return NextResponse.json({ error: err.message }, { status: 409 });
    reportError('api/admin/moderation', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
