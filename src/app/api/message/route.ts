// src/app/api/message/route.ts
// POST /api/message { memberId, content, senderContact?, isQuickReply? }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauMessage } from '@/lib/email-templates';
import { checkMessageRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { SCAN_WINDOW_MS, MAX_CONVERSATIONS, QUICK_REPLIES as QUICK_REPLIES_LIST } from '@/lib/constants';
import { moderateContent } from '@/lib/moderation';
import { getSenderToken, createSenderToken, setSenderTokenCookie } from '@/lib/sender-token';
import { isBlocked } from '@/lib/blocks';

const QUICK_REPLIES = new Set<string>(QUICK_REPLIES_LIST);

const schema = z.object({
  memberId:      z.string().uuid('memberId doit être un UUID valide'),
  content:       z.string().min(1, 'Message vide').max(1000, 'Message trop long (max 1000 caractères)'),
  senderContact: z.string().max(200).optional(),
  isQuickReply:  z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { memberId, content, senderContact, isQuickReply } = body.data;
    const ip = getIp(req);

    // Jeton device du scanneur (cookie httpOnly). `existingToken` n'existe que
    // s'il a déjà écrit auparavant — seul un device connu peut être bloqué.
    const existingToken = getSenderToken(req);
    const senderToken = existingToken ?? createSenderToken();

    // ─── Rate limiting double : IP + membre cible ─────────────────────────
    const rateLimit = await checkMessageRateLimit(ip, memberId);
    if (!rateLimit.success) {
      audit({
        action:   'message.rate_limited',
        memberId,
        ip,
        metadata: { reason: rateLimit.reason },
      });
      return NextResponse.json(
        { error: 'Trop de messages envoyés. Réessayez dans quelques minutes.' },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    // ─── Vérification membre ──────────────────────────────────────────────
    // admin : lit email (revoke pour anon en 026) pour la notification.
    const { data: member } = await supabaseAdmin
      .from('members').select('id, name, email, is_paused, plan').eq('id', memberId).single();

    if (!member) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    if (member.is_paused) {
      return NextResponse.json({ error: 'Ce membre est indisponible.', code: 'paused' }, { status: 403 });
    }

    // ─── Blocage device ───────────────────────────────────────────────────
    // Si ce porteur a bloqué ce device, on refuse. Réponse volontairement
    // identique à « indisponible » pour ne pas révéler le blocage au harceleur.
    if (await isBlocked(memberId, existingToken)) {
      return NextResponse.json({ error: 'Ce membre est indisponible.', code: 'paused' }, { status: 403 });
    }

    // ─── Vérification fenêtre temporelle (24h free / 48h premium) ──────
    const plan = (member.plan === 'premium' ? 'premium' : 'free') as keyof typeof SCAN_WINDOW_MS;
    const windowMs = SCAN_WINDOW_MS[plan];

    // admin : first_scans hérite la RLS owner-only de scans → anon renverrait
    // null et la fenêtre ne serait jamais appliquée (fail-open).
    const { data: firstScan } = await supabaseAdmin
      .from('first_scans').select('first_scan_at').eq('member_id', memberId).single();

    if (firstScan?.first_scan_at) {
      const elapsed = Date.now() - new Date(firstScan.first_scan_at).getTime();
      if (elapsed > windowMs) {
        const windowLabel = windowMs / 3_600_000;
        return NextResponse.json(
          { error: `La fenêtre de ${windowLabel}h est expirée.`, code: 'window_expired', windowHours: windowLabel },
          { status: 403 },
        );
      }
    }

    // ─── Limite de conversations actives (3 free / illimité premium) ──
    // Compte les messages RACINE uniquement — les replies dans le thread
    // ne multiplient pas les conversations.
    if (MAX_CONVERSATIONS[plan] !== Infinity) {
      // admin : messages est owner-only → anon renverrait 0 et le plafond ne
      // serait jamais appliqué (fail-open).
      const { count: activeConvs } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('moderated', false)
        .is('parent_id', null)
        .is('blocked_at', null); // une conv bloquée n'occupe pas un créneau actif

      if ((activeConvs ?? 0) >= MAX_CONVERSATIONS[plan]) {
        return NextResponse.json(
          { error: 'Nombre maximum de conversations atteint pour ce profil.', code: 'conversation_limit' },
          { status: 403 },
        );
      }
    }

    // ─── Modération ───────────────────────────────────────────────────────
    const isKnownQuickReply = QUICK_REPLIES.has(content.trim());
    const moderation = (!isQuickReply && !isKnownQuickReply)
      ? await moderateContent(content)
      : { flagged: false, source: 'regex' as const, categories: [] };
    const moderated = moderation.flagged;

    // ─── Insertion BDD ────────────────────────────────────────────────────
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        member_id:      memberId,
        content:        content.trim(),
        sender_contact: senderContact?.trim() || null,
        is_quick_reply: isQuickReply || isKnownQuickReply,
        moderated,
        sender_token:   senderToken,
      })
      .select('id')
      .single();

    if (msgError) throw msgError;

    // ─── Audit ────────────────────────────────────────────────────────────
    audit({
      action:   moderated ? 'message.moderated' : 'message.sent',
      memberId,
      ip,
      metadata: {
        messageId:    message?.id,
        isQuickReply: isKnownQuickReply,
        ...(moderated ? { moderationSource: moderation.source, categories: moderation.categories } : {}),
      },
    });

    // ─── Notification email ───────────────────────────────────────────────
    if (!moderated && member.email) {
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${member.id}`;
      const { subject, html } = emailNouveauMessage({
        memberName:    member.name,
        content:       content.trim(),
        senderContact: senderContact?.trim(),
        dashboardUrl,
      });
      sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[api/message] Échec envoi email:', err));
    }

    // Pose/rafraîchit le cookie de jeton device (httpOnly) — permet au porteur
    // de bloquer ce scanneur plus tard, même sur une autre conversation.
    const res = NextResponse.json({ ok: true, moderated, messageId: message?.id });
    setSenderTokenCookie(res, senderToken);
    return res;

  } catch (err) {
    console.error('[api/message]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}