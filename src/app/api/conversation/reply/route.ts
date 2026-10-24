// POST /api/conversation/reply
// Permet au scanner OU au membre d'ajouter un message dans le thread.
// Max 5 messages par conversation pour garder le côté éphémère.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, checkAuthRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { sendEmail, emailNouveauMessage, emailReponse } from '@/lib/email-templates';
import { notifyThreadSubscribers, notifyMemberSubscribers } from '@/lib/push-notify';
import { broadcastThreadMessage } from '@/lib/realtime-broadcast';
import { APP_URL, MAX_THREAD_MESSAGES, BANNED_DEVICE_NOTICE } from '@/lib/constants';
import { isValidEmail } from '@/lib/validators';
import { moderateContent } from '@/lib/moderation';
import { getSenderToken } from '@/lib/sender-token';
import { isBlocked, isDeviceBanned } from '@/lib/blocks';
import { isContactVerified } from '@/lib/contact-verification';
import { reportError } from '@/lib/report-error';
import { waitUntil } from '@/lib/wait-until';

const schema = z.object({
  messageId: z.string().uuid(),      // ID du message racine (le premier)
  // `.trim()` AVANT `.min(1)` : un contenu 100 % espaces (« &nbsp;&nbsp; ») passait
  // `min(1)` puis devenait '' à l'insert → bulle vide qui consomme un créneau du cap.
  content:   z.string().trim().min(1).max(2000),
  author:    z.enum(['scanner', 'member']),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { messageId, content, author } = body.data;

    // Récupère le message racine d'abord (besoin de member_id pour l'auth + du
    // sender_token pour verrouiller l'identité du scanneur). maybeSingle : 0 ligne
    // = lien invalide (cas normal), pas une erreur/406.
    const { data: rootMsg } = await supabaseAdmin
      .from('messages')
      .select('id, member_id, sender_contact, blocked_at, sender_token')
      .eq('id', messageId)
      .is('parent_id', null)
      .maybeSingle();

    if (!rootMsg) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }

    // ─── Blocage ──────────────────────────────────────────────────────────
    // Conversation fermée par le porteur → plus aucun message, des deux côtés.
    if (rootMsg.blocked_at) {
      return NextResponse.json({ error: 'Cette conversation est close.', code: 'blocked' }, { status: 403 });
    }

    if (author === 'scanner') {
      const token = getSenderToken(req);
      // ─── Verrou anti-imposture du scanneur ──────────────────────────────
      // Seul le device d'ORIGINE (cookie httpOnly posé au 1er message) peut écrire
      // au nom du scanneur. Le lien-capability permet de LIRE la conversation, pas
      // d'y injecter des messages « du scanneur » s'il fuite (email du porteur,
      // presse-papier, referer). Contrepartie assumée : pas de réponse cross-device
      // côté scanneur (il peut toujours LIRE). Legacy : root sans sender_token → on
      // ne peut pas vérifier, on tolère.
      if (rootMsg.sender_token && token !== rootMsg.sender_token) {
        return NextResponse.json(
          { error: "Répondez depuis l'appareil d'origine de la conversation.", code: 'wrong_device' },
          { status: 403 },
        );
      }
      // Device bloqué par ce porteur (ici ou ailleurs) : réponse opaque
      // « close », qui ne révèle pas le blocage.
      if (await isBlocked(rootMsg.member_id, token)) {
        return NextResponse.json({ error: 'Cette conversation est close.', code: 'blocked' }, { status: 403 });
      }
      // Banni globalement : dit clairement, avec le recours (art. 17).
      if (await isDeviceBanned(token)) {
        return NextResponse.json({ error: BANNED_DEVICE_NOTICE, code: 'banned' }, { status: 403 });
      }
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

    // Compte les messages VISIBLES du thread. moderated=false : un message modéré
    // occupe sinon un créneau côté serveur invisible côté client (le client et la
    // vue member_inbox excluent les modérés) → conversation bloquée avec erreur
    // brute alors que le formulaire est encore affiché.
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .or(`id.eq.${messageId},parent_id.eq.${messageId}`)
      .eq('moderated', false);

    if ((count ?? 0) >= MAX_THREAD_MESSAGES) {
      return NextResponse.json({ error: 'Cette conversation a atteint sa limite.', code: 'thread_limit' }, { status: 403 });
    }

    // Tour de parole : chacun son tour, comme l'affiche le client. Sans ce verrou,
    // un appel direct à l'API enchaînait les messages jusqu'au plafond avant toute
    // réponse. Le message racine est toujours du scanner.
    const { data: lastMsg } = await supabaseAdmin
      .from('messages')
      .select('author')
      .eq('parent_id', messageId)
      .eq('moderated', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((lastMsg?.author ?? 'scanner') === author) {
      return NextResponse.json(
        { error: 'Attendez sa réponse avant d’écrire à nouveau.', code: 'not_your_turn' },
        { status: 409 },
      );
    }

    // Modération (scanner anonyme inclus) — comme le message racine.
    const moderation = await moderateContent(content);

    // Cohérence avec le message racine (choix B) : un message modéré n'est PAS inséré.
    // Il ne laisse pas de ligne morte, et comme il serait de toute façon exclu du
    // compteur/affichage/realtime, rien ne change côté limite. L'auteur peut
    // reformuler (rate-limit + tour de parole plafonnent les ré-essais). On ne
    // propage jamais le contenu abusif.
    if (moderation.flagged) {
      return NextResponse.json({ ok: true, moderated: true });
    }

    // Insère le nouveau message (NON modéré) dans le thread
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

    // Notifications parties après la réponse : l'auteur, souvent sur une 4G
    // faible, n'attend ni Resend ni les services de push (sa réponse est déjà
    // enregistrée). waitUntil garde la fonction serverless en vie jusqu'au bout
    // des envois, sinon elle pourrait s'arrêter dès la réponse et les perdre.
    const notifications: Promise<unknown>[] = [];

    // Realtime — diffuse aux clients abonnés au canal du thread (scanner anon
    // inclus, via broadcast public).
    if (newMsg?.id) {
      notifications.push(broadcastThreadMessage(messageId, {
        id:         newMsg.id,
        content:    content.trim(),
        author,
        created_at: new Date().toISOString(),
      }).catch(() => {}));
    }

    // Notification email :
    //   * scanner → notifie le membre sur son email (alerte dashboard)
    //   * member → notifie le scanner sur sender_contact si c'est un email CONFIRMÉ

    if (author === 'scanner') {
      const { data: member } = await supabaseAdmin
        .from('members').select('name, email').eq('id', rootMsg.member_id).maybeSingle();

      if (member?.email) {
        const { subject, html } = emailNouveauMessage({
          memberName:      member.name,
          content:         content.trim(),
          senderContact:   rootMsg.sender_contact,
          conversationUrl: `${APP_URL}/conversation/${messageId}`,
        });
        notifications.push(
          sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[conversation/reply] Échec email membre:', err)),
        );
      }
    } else if (author === 'member') {
      // Uniquement vers une adresse confirmée par le passant (double opt-in) :
      // sinon un passant pouvait faire écrire la plateforme à un tiers.
      const contact = rootMsg.sender_contact?.trim();
      if (contact && isValidEmail(contact) && await isContactVerified(messageId, contact)) {
        const { data: member } = await supabaseAdmin
          .from('members').select('name').eq('id', rootMsg.member_id).maybeSingle();

        const { subject, html } = emailReponse({
          memberName: member?.name || 'Ce membre',
          reply:      content.trim(),
          convUrl:    `${APP_URL}/conversation/${messageId}`,
        });
        notifications.push(
          sendEmail({ to: contact, subject, html }).catch((err) => console.error('[conversation/reply] Échec email scanner:', err)),
        );
      }
    }

    // Push — notifie l'AUTRE côté, sur le bon scope :
    //   * member répond  → le scanneur (abonné au thread via messageId).
    //   * scanner répond → le PORTEUR (abonné au niveau membre depuis le dashboard —
    //     il n'est PAS abonné au thread ; sans ça il ne recevait que l'email).
    const pushBody = content.trim().slice(0, 80);
    const pushUrl  = `${APP_URL}/conversation/${messageId}`;
    if (author === 'member') {
      notifications.push(notifyThreadSubscribers({
        messageId, title: 'Nouveau message — réponse du membre', body: pushBody, url: pushUrl,
      }).catch((err) => console.error('[conversation/reply] Échec push thread:', err)));
    } else {
      notifications.push(notifyMemberSubscribers({
        memberId: rootMsg.member_id, messageId, title: 'Nouveau message', body: pushBody, url: pushUrl,
      }).catch((err) => console.error('[conversation/reply] Échec push membre:', err)));
    }

    waitUntil(Promise.allSettled(notifications));
    return NextResponse.json({ ok: true, moderated: false, replyId: newMsg?.id });

  } catch (err) {
    reportError('conversation/reply', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
