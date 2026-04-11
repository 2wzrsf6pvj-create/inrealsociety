// src/app/api/message/route.ts
// POST /api/message { memberId, content, senderContact?, isQuickReply? }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauMessage } from '@/lib/email-templates';
import { checkMessageRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { SCAN_WINDOW_MS, MAX_CONVERSATIONS } from '@/lib/constants';

const QUICK_REPLIES = new Set(["Belle audace.", "J'aime la démarche.", "👁"]);

const BANNED_WORDS = [
  'salope', 'pute', 'connasse', 'bitch', 'whore', 'slut',
  'viol', 'rape', 'tuer', 'kill', 'mort', 'suicide',
  'nique', 'fuck', 'baiser', 'sexe', 'cul',
  'menacer', 'adresse', 'retrouver', 'suivre',
];

const schema = z.object({
  memberId:      z.string().uuid('memberId doit être un UUID valide'),
  content:       z.string().min(1, 'Message vide').max(1000, 'Message trop long (max 1000 caractères)'),
  senderContact: z.string().max(200).optional(),
  isQuickReply:  z.boolean().optional(),
});

function moderateContent(content: string): boolean {
  const lower = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return BANNED_WORDS.some(word => lower.includes(word));
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { memberId, content, senderContact, isQuickReply } = body.data;
    const ip = getIp(req);

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
    const { data: member } = await supabase
      .from('members').select('id, name, email, is_paused, plan').eq('id', memberId).single();

    if (!member) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    if (member.is_paused) {
      return NextResponse.json({ error: 'Ce membre est indisponible.' }, { status: 403 });
    }

    // ─── Vérification fenêtre temporelle (24h free / 48h premium) ──────
    const plan = (member.plan === 'premium' ? 'premium' : 'free') as keyof typeof SCAN_WINDOW_MS;
    const windowMs = SCAN_WINDOW_MS[plan];

    const { data: firstScan } = await supabase
      .from('first_scans').select('first_scan_at').eq('member_id', memberId).single();

    if (firstScan?.first_scan_at) {
      const elapsed = Date.now() - new Date(firstScan.first_scan_at).getTime();
      if (elapsed > windowMs) {
        const windowLabel = windowMs / 3_600_000;
        return NextResponse.json({ error: `La fenêtre de ${windowLabel}h est expirée.` }, { status: 403 });
      }
    }

    // ─── Limite de conversations actives (3 free / illimité premium) ──
    if (MAX_CONVERSATIONS[plan] !== Infinity) {
      const { count: activeConvs } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('moderated', false);

      if ((activeConvs ?? 0) >= MAX_CONVERSATIONS[plan]) {
        return NextResponse.json({ error: 'Nombre maximum de conversations atteint pour ce profil.' }, { status: 403 });
      }
    }

    // ─── Modération ───────────────────────────────────────────────────────
    const isKnownQuickReply = QUICK_REPLIES.has(content.trim());
    const moderated = (!isQuickReply && !isKnownQuickReply)
      ? moderateContent(content)
      : false;

    // ─── Insertion BDD ────────────────────────────────────────────────────
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        member_id:      memberId,
        content:        content.trim(),
        sender_contact: senderContact?.trim() || null,
        is_quick_reply: isQuickReply || isKnownQuickReply,
        moderated,
      })
      .select('id')
      .single();

    if (msgError) throw msgError;

    // ─── Audit ────────────────────────────────────────────────────────────
    audit({
      action:   moderated ? 'message.moderated' : 'message.sent',
      memberId,
      ip,
      metadata: { messageId: message?.id, isQuickReply: isKnownQuickReply },
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

    return NextResponse.json({ ok: true, moderated, messageId: message?.id });

  } catch (err) {
    console.error('[api/message]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}