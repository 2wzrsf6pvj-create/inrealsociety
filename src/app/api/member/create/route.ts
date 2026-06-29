// src/app/api/member/create/route.ts
// POST { name, pitch, instagram?, activationCode }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { generateUniqueShortCode } from '@/lib/short-code';
import { fulfillOrder } from '@/lib/fulfillment';
import { audit } from '@/lib/audit';
import { sendEmail, emailBienvenue } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';

const schema = z.object({
  name:           z.string().min(1).max(50).trim(),
  pitch:          z.string().min(1).max(500).trim(),
  instagram:      z.string().max(50).optional(),
  activationCode: z.string().min(6).max(12).toUpperCase(),
  // §8/9 : consentement OBLIGATOIRE à l'activation. z.literal(true) → une requête
  // sans acceptation explicite (false/absent) est rejetée (preuve juridique).
  acceptedTerms:  z.literal(true),
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

    // ─── Génère un code court unique pour l'URL du QR code ─────────────────
    let shortCode: string | null = null;
    try {
      shortCode = await generateUniqueShortCode();
    } catch (scErr) {
      console.warn('[api/member/create] Short code generation failed:', scErr);
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
    // régénère un code et réessaie une fois, plutôt que de renvoyer un 500.
    const isUniqueViolation = (e: typeof rpcError) =>
      !!e && (e.code === '23505' || /duplicate key|unique/i.test(e.message ?? ''));
    if (isUniqueViolation(rpcError)) {
      try { shortCode = await generateUniqueShortCode(); } catch { shortCode = null; }
      ({ data, error: rpcError } = await callCreate(shortCode));
    }

    const result = data as unknown as CreateMemberResult;

    if (rpcError) {
      console.error('[api/member/create] RPC error:', rpcError);
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
      if (consentErr) console.error('[api/member/create] Consent timestamp failed:', consentErr.message);
      audit({
        action:   'member.activated',
        memberId: result.member_id,
        metadata: { activationCode, termsAcceptedAt: nowIso, serviceWaiverAt: nowIso },
      });
    }

    // ─── Email de bienvenue (non-bloquant) ──────────────────────────────
    if (result.member_id && auth.user.email) {
      const dashboardUrl = `${APP_URL}/dashboard`;
      const profileUrl   = `${APP_URL}/profil/${result.member_id}`;
      const { subject, html } = emailBienvenue({ name, dashboardUrl, profileUrl });
      sendEmail({ to: auth.user.email, subject, html })
        .catch(err => console.error('[api/member/create] Welcome email failed:', err));
    }

    // ─── Déclenche fulfillment Printful (non-bloquant) ────────────────────
    // Cherche l'order lié à ce code d'activation. Si pas trouvé (membre créé
    // sans achat — e.g. invité), on ignore. Si l'order est déjà fulfilled,
    // fulfillOrder retourne alreadyFulfilled=true (idempotent).
    if (result.member_id) {
      try {
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('id, tshirt_color, printful_order_id, status')
          .eq('activation_code', activationCode)
          .single();

        if (order && order.status === 'paid' && !order.printful_order_id) {
          const tshirtColor = (order.tshirt_color === 'light') ? 'light' : 'dark';
          const fulfillResult = await fulfillOrder({
            orderId:     order.id,
            memberId:    result.member_id,
            tshirtColor,
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
        // Ne JAMAIS bloquer l'inscription pour un problème Printful — l'utilisateur
        // a payé, son profil est créé, le support peut re-déclencher le fulfillment
        // manuellement si besoin.
        console.error('[api/member/create] Fulfillment exception:', fulfillErr);
        audit({
          action:   'order.fulfillment_failed',
          memberId: result.member_id,
          metadata: { reason: fulfillErr instanceof Error ? fulfillErr.message : String(fulfillErr), trigger: 'member_create' },
        });
      }
    }

    return NextResponse.json({ memberId: result.member_id });

  } catch (err) {
    console.error('[api/member/create]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
