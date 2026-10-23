// src/app/api/member/create/route.ts
// POST { name, pitch, instagram?, activationCode }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { generateUniqueShortCode } from '@/lib/short-code';
import { fulfillOrder, orderQrStoragePath } from '@/lib/fulfillment';
import { audit } from '@/lib/audit';
import { moderateProfileFields, profileRefusalMessage } from '@/lib/moderation';
import { sendEmail, emailBienvenue } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';
import { reportError } from '@/lib/report-error';

const schema = z.object({
  name:           z.string().min(1).max(50).trim(),
  pitch:          z.string().min(1).max(500).trim(),
  instagram:      z.string().max(50).optional(),
  activationCode: z.string().min(6).max(12).toUpperCase(),
  // §8/9 : consentement OBLIGATOIRE à l'activation. z.literal(true) → une requête
  // sans acceptation explicite (false/absent) est rejetée (preuve juridique).
  acceptedTerms:  z.literal(true),
  // Service réservé aux 18 ans et plus : déclaration explicite, comme les CGV.
  isAdult:        z.literal(true),
  // NB : la forme du QR et l'accroche sont VERROUILLÉES au checkout (le tee est
  // imprimé au paiement). Plus de « dernière chance » ici — ces champs ne sont
  // plus acceptés.
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    // checkAuthRateLimit fail-open en interne si Redis tombe (centralisé) — plus
    // besoin du try/catch local : comportement uniforme avec les autres routes auth.
    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { name, pitch, instagram, activationCode } = body.data;

    // Textes publics du profil : filtrés comme les messages, AVANT de consommer
    // le code d'activation (le porteur corrige et renvoie).
    const refused = await moderateProfileFields({ name, pitch, instagram });
    if (refused) {
      audit({
        action:   'profile.moderated',
        metadata: { field: refused.field, source: refused.result.source, categories: refused.result.categories, step: 'create' },
      });
      return NextResponse.json(
        { error: profileRefusalMessage(refused.field), code: 'moderated', field: refused.field },
        { status: 400 },
      );
    }

    // ─── Récupère la commande liée AVANT de créer le membre ────────────────
    // Deux infos y sont clés :
    //  1. `short_code` RÉSERVÉ au paiement (FULFILL_ON_PAYMENT) : le tee est déjà
    //     imprimé avec CE code → le membre doit en HÉRITER, sinon le QR physique
    //     pointerait vers un autre profil. `null` = pas réservé (ancien modèle) →
    //     on en génère un neuf.
    //  2. `printful_order_id` : si présent, le tee est déjà imprimé (au paiement)
    //     → on ne réimprime pas, on pointe juste le QR digital du membre.
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, tshirt_color, tshirt_size, printful_order_id, status, short_code')
      .eq('activation_code', activationCode)
      .maybeSingle();

    // Code court : hérité de la commande (réservé), sinon généré à la volée.
    const inheritedShortCode = (order?.short_code as string | null) ?? null;
    let shortCode: string | null = inheritedShortCode;
    if (!shortCode) {
      try {
        shortCode = await generateUniqueShortCode();
      } catch (scErr) {
        console.warn('[api/member/create] Short code generation failed:', scErr);
      }
    }

    // ─── Création atomique : consomme le code + crée le membre en une transaction
    interface CreateMemberResult {
      member_id: string | null;
      already_exists: boolean;
      error_message: string | null;
    }

    const callCreate = (sc: string | null) =>
      supabaseAdmin.rpc('create_member_with_code', {
        p_auth_user_id: auth.user.id,
        p_code:         activationCode,
        p_name:         name,
        p_pitch:        pitch,
        p_email:        auth.user.email || null,
        p_instagram:    instagram?.trim().replace(/^@/, '') || null,
        p_short_code:   sc,
      }).single();

    let { data, error: rpcError } = await callCreate(shortCode);

    // Collision short_code (TOCTOU SELECT-puis-INSERT sur l'index unique) →
    // régénère un code et réessaie une fois. MAIS seulement si le code a été
    // GÉNÉRÉ : un code HÉRITÉ (réservé, déjà imprimé sur le tee) ne doit jamais
    // être remplacé en silence — le QR physique deviendrait orphelin. Une collision
    // sur un code hérité est quasi-impossible (unicité vérifiée à la réservation) ;
    // on la laisse alors remonter en erreur pour traitement support.
    const isUniqueViolation = (e: typeof rpcError) =>
      !!e && (e.code === '23505' || /duplicate key|unique/i.test(e.message ?? ''));
    if (isUniqueViolation(rpcError) && !inheritedShortCode) {
      try { shortCode = await generateUniqueShortCode(); } catch { shortCode = null; }
      ({ data, error: rpcError } = await callCreate(shortCode));
    }

    const result = data as unknown as CreateMemberResult;

    if (rpcError) {
      reportError('api/member/create', rpcError, { step: 'RPC error' });
      return NextResponse.json({ error: 'Erreur création profil.' }, { status: 500 });
    }

    if (result.error_message) {
      return NextResponse.json({ error: result.error_message }, { status: 400 });
    }

    if (result.already_exists) {
      return NextResponse.json({ memberId: result.member_id, alreadyExists: true });
    }

    // ─── §8/9 : preuve de consentement d'activation (horodatée) ───────────
    // CGV/CGU acceptées + demande d'exécution immédiate du SERVICE avec
    // renonciation au droit de rétractation SUR LE SERVICE. Le bien (t-shirt)
    // reste rétractable 14 j (cf. CGV). acceptedTerms est garanti true (schéma).
    // member.activated est exempté de la purge audit (migration 046) = preuve durable.
    if (result.member_id) {
      const nowIso = new Date().toISOString();
      const { error: consentErr } = await supabaseAdmin
        .from('members')
        .update({ terms_accepted_at: nowIso, service_waiver_at: nowIso })
        .eq('id', result.member_id);
      // N'émettre la preuve d'audit QUE si les colonnes reflètent le consentement,
      // sinon les deux sources de vérité divergent (audit « activé » sans timestamps).
      if (consentErr) {
        console.error('[api/member/create] Consent timestamp failed:', consentErr.message);
      } else {
        audit({
          action:   'member.activated',
          memberId: result.member_id,
          metadata: { activationCode, termsAcceptedAt: nowIso, serviceWaiverAt: nowIso, adultDeclaredAt: nowIso },
        });
      }
    }

    // ─── Email de bienvenue ─────────────────────────────────────────────
    // Un échec n'empêche pas l'activation, mais l'envoi est attendu : une
    // fonction serverless peut s'arrêter dès la réponse envoyée (cf. /api/report).
    if (result.member_id && auth.user.email) {
      const dashboardUrl = `${APP_URL}/dashboard`;
      const profileUrl   = `${APP_URL}/profil/${result.member_id}`;
      const { subject, html } = emailBienvenue({ name, dashboardUrl, profileUrl });
      await sendEmail({ to: auth.user.email, subject, html })
        .catch(err => console.error('[api/member/create] Welcome email failed:', err));
    }

    // ─── Fulfillment / QR digital du membre (non-bloquant) ────────────────
    // `order` a été chargé plus haut. Trois cas :
    //  a. Pas de commande (membre invité sans achat) → rien.
    //  b. Commande payée DÉJÀ imprimée (printful_order_id, cas FULFILL_ON_PAYMENT) :
    //     le membre a hérité du short_code réservé → on pointe simplement son QR
    //     digital vers le fichier déjà uploadé (même code, même contenu). Pas de
    //     réimpression.
    //  c. Commande payée NON encore imprimée (ancien modèle, ou échec au webhook) :
    //     filet → on imprime maintenant (fulfillOrder, idempotent).
    if (result.member_id && order && order.status === 'paid') {
      const tshirtColor = (order.tshirt_color === 'light') ? 'light' : 'dark';
      try {
        if (order.printful_order_id) {
          // Cas b : pointer le QR digital vers le fichier de la commande.
          const path = orderQrStoragePath(order.id, tshirtColor);
          const { data: { publicUrl } } = supabaseAdmin.storage.from('qrcodes').getPublicUrl(path);
          await supabaseAdmin.from('members').update({ qr_code_url: publicUrl }).eq('id', result.member_id);
        } else {
          // Cas c : impression à l'activation (filet).
          const fulfillResult = await fulfillOrder({
            orderId:     order.id,
            memberId:    result.member_id,
            tshirtColor,
            tshirtSize:  order.tshirt_size,
          });
          if (fulfillResult.ok) {
            audit({
              action:   'order.fulfilled',
              memberId: result.member_id,
              metadata: { orderId: order.id, printfulOrderId: fulfillResult.printfulOrderId, trigger: 'member_create' },
            });
          } else {
            audit({
              action:   'order.fulfillment_failed',
              memberId: result.member_id,
              metadata: { orderId: order.id, reason: fulfillResult.reason, trigger: 'member_create' },
            });
            console.error('[api/member/create] Fulfillment failed:', fulfillResult.reason);
          }
        }
      } catch (fulfillErr) {
        // Ne JAMAIS bloquer l'inscription pour un problème Printful/Storage —
        // l'utilisateur a payé, son profil est créé, le cron rejouera si besoin.
        console.error('[api/member/create] Fulfillment exception:', fulfillErr);
        audit({
          action:   'order.fulfillment_failed',
          memberId: result.member_id,
          metadata: { orderId: order.id, reason: fulfillErr instanceof Error ? fulfillErr.message : String(fulfillErr), trigger: 'member_create' },
        });
      }
    }

    return NextResponse.json({ memberId: result.member_id });

  } catch (err) {
    reportError('api/member/create', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
