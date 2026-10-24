// src/app/api/message/route.ts
// POST /api/message { memberId, content, senderContact?, isQuickReply? }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauMessage, emailConversationLimit } from '@/lib/email-templates';
import { checkMessageRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { SCAN_WINDOW_MS, MAX_CONVERSATIONS, CONVERSATION_WINDOW_DAYS, QUICK_REPLIES as QUICK_REPLIES_LIST } from '@/lib/constants';
import { moderateContent } from '@/lib/moderation';
import { isValidFirstName, isValidEmail } from '@/lib/validators';
import { startContactVerification } from '@/lib/contact-verification';
import { getSenderToken, createSenderToken, setSenderTokenCookie } from '@/lib/sender-token';
import { isBlocked, isDeviceBanned } from '@/lib/blocks';
import { getActiveConversationsCount } from '@/lib/inbox';
import { notifyMemberSubscribers } from '@/lib/push-notify';
import { captureServerEvent } from '@/lib/posthog-server';
import { APP_URL, BANNED_DEVICE_NOTICE } from '@/lib/constants';
import { reportError } from '@/lib/report-error';
import { waitUntil } from '@/lib/wait-until';

const QUICK_REPLIES = new Set<string>(QUICK_REPLIES_LIST);

const schema = z.object({
  memberId:      z.string().uuid('memberId doit être un UUID valide'),
  // `.trim()` AVANT `.min(1)` : un message 100 % espaces passait la validation puis
  // devenait '' à l'insert (bulle vide, notif envoyée, message unique du device brûlé).
  content:       z.string().trim().min(1, 'Message vide').max(1000, 'Message trop long (max 1000 caractères)'),
  senderContact: z.string().max(200).nullish(),  // le client envoie null si vide
  senderName:    z.string().max(50).nullish(),    // (idem) — .optional() rejetterait null
  isQuickReply:  z.boolean().optional(),
});

/**
 * Réserve l'email « plafond atteint » de la semaine. Sans la migration 059 (ou en
 * cas d'erreur), rien ne part : sans réservation, chaque refus enverrait un email.
 */
async function claimCapEmail(memberId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('claim_cap_email', { p_member_id: memberId });
    if (error) throw new Error(error.message);
    return data === true;
  } catch (err) {
    // Le refus doit rester un refus (403), pas devenir une erreur serveur.
    console.error('[api/message] claim_cap_email indisponible (migration 059 ?) :', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      console.warn('[api/message] validation échouée:', body.error.flatten().fieldErrors);
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { memberId, content, senderContact, senderName, isQuickReply } = body.data;
    const ip = getIp(req);

    // Jeton device du scanneur (cookie httpOnly). `existingToken` existe dès
    // l'ouverture du formulaire (cf. proxy) ou après un premier message ; neuf,
    // il n'a ni historique ni blocage — seul un device qui a écrit peut être bloqué.
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
      .from('members').select('id, name, email, is_paused, require_contact, plan').eq('id', memberId).maybeSingle();

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

    // ─── Bannissement global du device (anti-harcèlement en série) ─────────
    // Dit clairement, avec sa raison et le recours (choix de Clément, art. 17
    // du règlement sur les services numériques) ; le blocage par un porteur,
    // lui, reste discret (ci-dessus).
    if (await isDeviceBanned(existingToken)) {
      return NextResponse.json({ error: BANNED_DEVICE_NOTICE, code: 'banned' }, { status: 403 });
    }

    // ─── §4 : un seul message racine par device et par porteur ─────────────
    // Si ce device a déjà écrit un message racine à ce porteur, c'est à lui de
    // répondre — pas de second canal. Vérifié seulement si le device est CONNU
    // (cookie déjà posé) ; un device neuf n'a pas d'historique.
    // NB : les messages MODÉRÉS ne sont PAS insérés (cf. plus bas) → ils ne comptent
    // pas ici, donc un scanneur peut reformuler après un faux positif. L'anti-bypass
    // « re-essais infinis » est assuré par le rate-limit, pas par ce compteur.
    // Un rescan rouvre la fenêtre mais ne redonne pas un message racine.
    if (existingToken) {
      const { data: priorRoot } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('member_id', memberId)
        .eq('sender_token', existingToken)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (priorRoot) {
        // conversationId : la conversation de CE device (même jeton), pour l'y
        // renvoyer même si son lien n'est plus en localStorage.
        return NextResponse.json(
          { error: 'Vous avez déjà écrit à ce membre : la suite se passe dans votre conversation.', code: 'already_messaged', conversationId: priorRoot.id },
          { status: 409 },
        );
      }
    }

    // ─── Contact requis ───────────────────────────────────────────────────
    // Le porteur peut exiger un @insta/email pour filtrer les messages anonymes.
    if (member.require_contact && !senderContact?.trim()) {
      return NextResponse.json(
        { error: 'Ce membre demande un moyen de le recontacter.', code: 'contact_required' },
        { status: 403 },
      );
    }

    // ─── Vérification fenêtre temporelle (24h free / 48h premium) ──────
    const plan = (member.plan === 'premium' ? 'premium' : 'free') as keyof typeof SCAN_WINDOW_MS;
    const windowMs = SCAN_WINDOW_MS[plan];

    // admin : first_scans hérite la RLS owner-only de scans → anon renverrait
    // null et la fenêtre ne serait jamais appliquée (fail-open).
    // maybeSingle : 0 ligne = membre jamais scanné (cas normal), pas une erreur/406.
    const { data: firstScan } = await supabaseAdmin
      .from('first_scans').select('first_scan_at').eq('member_id', memberId).maybeSingle();

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
    // Messages RACINE des CONVERSATION_WINDOW_DAYS derniers jours, hors bloqués
    // (cf. getActiveConversationsCount) — les replies ne comptent pas, et une
    // conversation ancienne libère son créneau au lieu de l'occuper à vie.
    if (MAX_CONVERSATIONS[plan] !== Infinity) {
      const activeConvs = await getActiveConversationsCount(memberId);

      if (activeConvs >= MAX_CONVERSATIONS[plan]) {
        // Le porteur apprend qu'il a manqué quelqu'un, une fois par semaine au
        // plus (choix de Clément, migration 059). Rien sur la personne refusée.
        // Envoi après la réponse, comme les notifications plus bas.
        if (member.email && await claimCapEmail(memberId)) {
          const { subject, html } = emailConversationLimit({
            name:             member.name,
            maxConversations: MAX_CONVERSATIONS[plan],
            windowDays:       CONVERSATION_WINDOW_DAYS,
            dashboardUrl:     `${APP_URL}/dashboard?tab=inbox`,
          });
          waitUntil(sendEmail({ to: member.email, subject, html })
            .catch((err) => console.error('[api/message] Échec email plafond:', err)));
        }
        return NextResponse.json(
          { error: 'Nombre maximum de conversations atteint pour ce profil.', code: 'conversation_limit' },
          { status: 403 },
        );
      }
    }

    // ─── Modération ───────────────────────────────────────────────────────
    // Le prénom est du texte libre affiché au porteur → on le modère aussi
    // (même quand le message est une quick-reply non modérée). Un prénom abusif
    // est simplement droppé : le message part en « Anonyme » plutôt que de tout
    // bloquer. Les deux modérations tournent en parallèle (pas de double latence).
    // On ne saute la modération QUE pour une quick-reply VÉRIFIÉE SERVEUR
    // (`isKnownQuickReply` = contenu ∈ liste figée). Le flag client `isQuickReply`
    // ne doit JAMAIS conditionner la modération : sinon `{content:"<abus>",
    // isQuickReply:true}` la contournait entièrement (message livré non modéré).
    // Le contact aussi est affiché au porteur (tableau de bord, email) : texte libre
    // modéré comme le message, sinon une insulte y passait sans filtre.
    // Le prénom doit en plus avoir un format de prénom (cf. isValidFirstName).
    const isKnownQuickReply = QUICK_REPLIES.has(content.trim());
    const rawName = senderName?.trim() || '';
    const trimmedName = isValidFirstName(rawName) ? rawName : '';
    const trimmedContact = senderContact?.trim() || '';
    const passthrough = { flagged: false, source: 'regex' as const, categories: [] };
    const [moderation, nameModeration, contactModeration] = await Promise.all([
      isKnownQuickReply ? Promise.resolve(passthrough) : moderateContent(content),
      trimmedName ? moderateContent(trimmedName) : Promise.resolve(passthrough),
      trimmedContact ? moderateContent(trimmedContact) : Promise.resolve(passthrough),
    ]);
    const cleanName: string | null = (trimmedName && !nameModeration.flagged) ? trimmedName : null;

    // ─── Message signalé : NON inséré ─────────────────────────────────────
    // On ne l'écrit PAS en base → il ne consomme pas le message unique du device
    // (§4). Le scanneur peut donc reformuler : un faux positif de la modération
    // (regex) ne le verrouille pas à vie sur le geste central du produit. L'audit
    // garde la trace de la tentative (sender_token → harcèlement en série) et le
    // rate-limit plafonne les ré-essais abusifs. Le porteur ne reçoit rien.
    // Un contact signalé bloque tout le message (contrairement au prénom, qu'on
    // peut simplement retirer) : il peut être exigé par le porteur.
    if (moderation.flagged || contactModeration.flagged) {
      const flaggedBy = moderation.flagged ? moderation : contactModeration;
      audit({
        action:   'message.moderated',
        memberId,
        ip,
        metadata: {
          isQuickReply: isKnownQuickReply, senderToken,
          field: moderation.flagged ? 'content' : 'contact',
          moderationSource: flaggedBy.source, categories: flaggedBy.categories,
        },
      });
      const res = NextResponse.json({ ok: true, moderated: true });
      setSenderTokenCookie(res, senderToken); // device identifié pour la reformulation
      return res;
    }

    // ─── Insertion BDD (message NON modéré) ───────────────────────────────
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        member_id:      memberId,
        content:        content.trim(),
        sender_contact: senderContact?.trim() || null,
        sender_name:    cleanName,
        is_quick_reply: isQuickReply || isKnownQuickReply,
        moderated:      false,
        sender_token:   senderToken,
      })
      .select('id')
      .single();

    if (msgError) {
      // Course perdue sur l'index unique (migration 047) : deux envois quasi
      // simultanés du même device vers le même porteur. Même réponse que le
      // garde applicatif §4 plus haut → « un seul message » garanti côté BDD.
      if (msgError.code === '23505') {
        return NextResponse.json(
          { error: 'Vous avez déjà envoyé un message à ce profil. À lui de répondre.', code: 'already_messaged' },
          { status: 409 },
        );
      }
      throw msgError;
    }

    // ─── Audit ────────────────────────────────────────────────────────────
    audit({
      action:   'message.sent',
      memberId,
      ip,
      // sender_token (pseudonyme) : relie un abus à travers plusieurs porteurs
      // (harcèlement en série). Trace conservée 24 mois.
      metadata: { messageId: message?.id, isQuickReply: isKnownQuickReply, senderToken },
    });

    // ─── Notifications du porteur ─────────────────────────────────────────
    // Parties après la réponse : le passant, souvent sur une 4G faible, n'attend
    // ni Resend ni les services de push (son message est déjà enregistré).
    // waitUntil garde la fonction serverless en vie jusqu'au bout des envois,
    // sinon elle pourrait s'arrêter dès la réponse et les perdre. Chacune
    // rattrape sa propre erreur : un échec ne bloque pas les autres.
    const notifications: Promise<unknown>[] = [
      // Rétention (P0) : signal reçu par le PORTEUR (distinctId = member_id)
      captureServerEvent({
        distinctId: memberId,
        event:      'member_signal_received',
        properties: { member_id: memberId, is_quick_reply: isKnownQuickReply, has_contact: !!senderContact?.trim() },
      }).catch(() => {}),
    ];

    if (member.email) {
      const { subject, html } = emailNouveauMessage({
        memberName:      member.name,
        content:         content.trim(),
        senderContact:   senderContact?.trim(),
        senderName:      cleanName ?? undefined,
        conversationUrl: message?.id ? `${APP_URL}/conversation/${message.id}` : `${APP_URL}/dashboard`,
      });
      notifications.push(
        sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[api/message] Échec envoi email:', err)),
      );
    }

    // Push : porteur abonné au niveau membre depuis le dashboard
    if (message?.id) {
      notifications.push(notifyMemberSubscribers({
        memberId,
        messageId: message.id, // tag par message → les notifs s'empilent
        title: 'Nouveau signal',
        body:  content.trim().slice(0, 80),
        url:   `${APP_URL}/conversation/${message.id}`,
      }).catch((err) => console.error('[api/message] Échec push membre:', err)));
    }

    // ─── Contact email : lien de confirmation (double opt-in) ─────────────
    // Les réponses du porteur ne partiront à cette adresse qu'une fois confirmée
    // (cf. contact-verification). Un échec ici n'empêche pas l'envoi du message.
    let contactVerification: 'sent' | 'none' = 'none';
    if (message?.id && isValidEmail(trimmedContact)) {
      try {
        const sent = await startContactVerification({ messageId: message.id, email: trimmedContact, memberName: member.name });
        if (sent) contactVerification = 'sent';
      } catch (err) {
        console.error('[api/message] Vérification du contact impossible:', err);
      }
    }

    waitUntil(Promise.allSettled(notifications));

    // Pose/rafraîchit le cookie de jeton device (httpOnly) — permet au porteur
    // de bloquer ce scanneur plus tard, même sur une autre conversation.
    const res = NextResponse.json({ ok: true, moderated: false, messageId: message?.id, contactVerification });
    setSenderTokenCookie(res, senderToken);
    return res;

  } catch (err) {
    reportError('api/message', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}