// POST /api/conversation/reply
// Permet au scanner OU au membre d'ajouter un message dans le thread.
// Max 5 messages par conversation pour garder le côté éphémère.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, checkAuthRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { sendEmail, emailNouveauMessage, emailReponse } from '@/lib/email-templates';
import { notifyThreadSubscribers } from '@/lib/push-notify';
import { broadcastThreadMessage } from '@/lib/realtime-broadcast';
import { APP_URL, MAX_THREAD_MESSAGES } from '@/lib/constants';
import { isValidEmail } from '@/lib/validators';
import { moderateContent } from '@/lib/moderation';
import { getSenderToken } from '@/lib/sender-token';
import { isBlocked } from '@/lib/blocks';

const schema = z.object({
  messageId: z.string().uuid(),      // ID du message racine (le premier)
  content:   z.string().min(1).max(2000),
  author:    z.enum(['scanner', 'member']),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { messageId, content, author } = body.data;

    // Récupère le message racine d'abord (besoin de rootMsg.member_id pour l'auth)
    const { data: rootMsg } = await supabaseAdmin
      .from('messages')
      .select('id, member_id, sender_contact, blocked_at')
      .eq('id', messageId)
      .is('parent_id', null)
      .single();

    if (!rootMsg) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }

    // ─── Blocage ──────────────────────────────────────────────────────────
    // Conversation fermée par le porteur → plus aucun message, des deux côtés.
    if (rootMsg.blocked_at) {
      return NextResponse.json({ error: 'Cette conversation est close.', code: 'blocked' }, { status: 403 });
    }
    // Device bloqué par ce porteur via une AUTRE conversation → on coupe aussi ici.
    if (author === 'scanner' && await isBlocked(rootMsg.member_id, getSenderToken(req))) {
      return NextResponse.json({ error: 'Cette conversation est close.', code: 'blocked' }, { status: 403 });
    }

    // Auth + rate limit selon l'auteur :
    //   * member : auth obligatoire + ownership du profil (anti-impersonation)
    //   * scanner : public, rate limit par IP
    if (author === 'member') {
      const auth = await requireAuth(req);
      if (isHttpError(auth)) return auth;

      const own = await requireOwnership(auth.user.id, rootMsg.member_id);
      if (isHttpError(own)) return own;

      const rl = await checkAuthRateLimit(auth.user.id);
      if (!rl.success) {
        return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
      }
    } else {
      const ip = getIp(req);
      const rl = await checkPublicRateLimit(ip);
      if (!rl.success) {
        return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
      }
    }

    // Compte les messages dans ce thread
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .or(`id.eq.${messageId},parent_id.eq.${messageId}`);

    if ((count ?? 0) >= MAX_THREAD_MESSAGES) {
      return NextResponse.json({ error: 'Cette conversation a atteint sa limite.' }, { status: 403 });
    }

    // Modération (scanner anonyme inclus) — comme le message racine.
    const moderation = await moderateContent(content);

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
        moderated:      moderation.flagged,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // Si modéré : stocké (moderated:true, masqué partout) mais NON diffusé ni
    // notifié — on ne propage pas le contenu abusif.
    if (!moderation.flagged) {
      // Realtime fire-and-forget — diffuse aux clients abonnés au canal du
      // thread (scanner anon inclus, via broadcast public).
      if (newMsg?.id) {
        broadcastThreadMessage(messageId, {
          id:         newMsg.id,
          content:    content.trim(),
          author,
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }

      // Notification email :
      //   * scanner → notifie le membre sur son email (alerte dashboard)
      //   * member → notifie le scanner sur sender_contact si c'est un email
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
          sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[conversation/reply] Échec email membre:', err));
        }
      } else if (author === 'member') {
        const contact = rootMsg.sender_contact?.trim();
        if (contact && isValidEmail(contact)) {
          const { data: member } = await supabaseAdmin
            .from('members')
            .select('name')
            .eq('id', rootMsg.member_id)
            .single();

          const { subject, html } = emailReponse({
            memberName: member?.name || 'Ce membre',
            reply:      content.trim(),
            convUrl:    `${APP_URL}/conversation/${messageId}`,
          });
          sendEmail({ to: contact, subject, html }).catch((err) => console.error('[conversation/reply] Échec email scanner:', err));
        }
      }

      // Push notification fire-and-forget — abonnés au thread. Notifie l'autre côté.
      const otherSide = author === 'member' ? 'scanner' : 'membre';
      notifyThreadSubscribers({
        messageId,
        title: `Nouveau message — réponse du ${otherSide}`,
        body:  content.trim().slice(0, 80),
        url:   `${APP_URL}/conversation/${messageId}`,
      }).catch((err) => console.error('[conversation/reply] Échec push notif:', err));
    }

    return NextResponse.json({ ok: true, moderated: moderation.flagged, replyId: newMsg?.id });

  } catch (err) {
    console.error('[conversation/reply]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
