// src/app/api/reply/route.ts
// POST /api/reply { messageId, reply, memberId }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_URL } from '@/lib/constants';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { sendEmail, emailReponse } from '@/lib/email-templates';
import { notifyThreadSubscribers } from '@/lib/push-notify';
import { audit } from '@/lib/audit';
import { getIp, checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { isValidEmail, isInstagramHandle } from '@/lib/validators';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
  reply:     z.string().min(1).max(2000),
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

    const { messageId, reply, memberId } = body.data;
    const ip = getIp(req);

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('id, member_id, sender_contact')
      .eq('id', messageId)
      .eq('member_id', memberId)
      .is('parent_id', null)
      .single();

    if (!msg) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    }

    // Insère la réponse comme message thread (author='member'). Anciennement
    // un UPDATE de messages.reply — désormais unifié avec /api/conversation/reply.
    // La vue member_inbox expose toujours .reply pour la dashboard inbox.
    const { error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        member_id:      memberId,
        parent_id:      messageId,
        author:         'member',
        content:        reply.trim(),
        is_quick_reply: false,
        moderated:      false,
      });

    if (insertErr) throw insertErr;

    audit({
      action:   'reply.sent',
      memberId,
      ip,
      metadata: { messageId },
    });

    const contact = msg.sender_contact?.trim();
    let emailSent = false;

    if (contact && isValidEmail(contact)) {
      const { data: memberData } = await supabaseAdmin
        .from('members').select('name').eq('id', memberId).single();

      const appUrl = APP_URL;
      const { subject, html } = emailReponse({
        memberName: memberData?.name || 'Ce membre',
        reply:      reply.trim(),
        convUrl:    `${appUrl}/conversation/${messageId}`,
      });

      emailSent = await sendEmail({ to: contact, subject, html });
    }

    // Push notification fire-and-forget — scanners qui ont activé les notifs.
    notifyThreadSubscribers({
      messageId,
      title: 'Nouveau message — réponse du membre',
      body:  reply.trim().slice(0, 80),
      url:   `${APP_URL}/conversation/${messageId}`,
    }).catch((err) => console.error('[api/reply] Échec push notif:', err));

    return NextResponse.json({
      ok:          true,
      emailSent,
      isInstagram: contact ? isInstagramHandle(contact) : false,
      contact:     contact || null,
    });

  } catch (err) {
    console.error('[api/reply]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
