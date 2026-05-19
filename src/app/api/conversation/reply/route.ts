// POST /api/conversation/reply
// Permet au scanner OU au membre d'ajouter un message dans le thread.
// Max 5 messages par conversation pour garder le côté éphémère.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { sendEmail, emailNouveauMessage } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';

const MAX_MESSAGES_PER_THREAD = 5;

const schema = z.object({
  messageId: z.string().uuid(),      // ID du message racine (le premier)
  content:   z.string().min(1).max(2000),
  author:    z.enum(['scanner', 'member']),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const rl = await checkPublicRateLimit(ip);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { messageId, content, author } = body.data;

    // Récupère le message racine
    const { data: rootMsg } = await supabaseAdmin
      .from('messages')
      .select('id, member_id, sender_contact')
      .eq('id', messageId)
      .is('parent_id', null)
      .single();

    if (!rootMsg) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }

    // Compte les messages dans ce thread
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .or(`id.eq.${messageId},parent_id.eq.${messageId}`);

    if ((count ?? 0) >= MAX_MESSAGES_PER_THREAD) {
      return NextResponse.json({ error: 'Cette conversation a atteint sa limite.' }, { status: 403 });
    }

    // Insère le nouveau message dans le thread
    const { data: newMsg, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        member_id:      rootMsg.member_id,
        parent_id:      messageId,
        content:        content.trim(),
        author,
        sender_contact: rootMsg.sender_contact,
        is_quick_reply: false,
        moderated:      false,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // Notification email au membre si le scanner a répondu
    if (author === 'scanner') {
      const { data: member } = await supabaseAdmin
        .from('members')
        .select('name, email')
        .eq('id', rootMsg.member_id)
        .single();

      if (member?.email) {
        const dashboardUrl = `${APP_URL}/conversation/${messageId}`;
        const { subject, html } = emailNouveauMessage({
          memberName:    member.name,
          content:       content.trim(),
          senderContact: rootMsg.sender_contact,
          dashboardUrl,
        });
        sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[conversation/reply] Échec email:', err));
      }
    }

    return NextResponse.json({ ok: true, replyId: newMsg?.id });

  } catch (err) {
    console.error('[conversation/reply]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
