// DELETE /api/member/delete
// Supprime le profil membre et le compte auth (RGPD).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import Stripe from 'stripe';

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Trop de requêtes.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // Récupère le membre
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, email, stripe_customer_id, stripe_subscription_id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // Annule l'abonnement Stripe si actif
    if (member.stripe_subscription_id) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-03-25.dahlia',
        });
        await stripe.subscriptions.cancel(member.stripe_subscription_id);
      } catch (err) {
        console.warn('[member/delete] Échec annulation Stripe:', err);
      }
    }

    // ─── Supprime les fichiers Storage (photos + QR codes) ─────────────
    // Storage delete ne propage pas d'erreur si le fichier n'existe pas — safe.
    for (const bucket of ['avatars', 'qrcodes'] as const) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(member.id);
      if (files && files.length > 0) {
        const paths = files.map(f => `${member.id}/${f.name}`);
        const { error: storageErr } = await supabaseAdmin.storage.from(bucket).remove(paths);
        if (storageErr) console.warn(`[member/delete] Storage ${bucket}:`, storageErr.message);
      }
    }

    // ─── Supprime les données liées ────────────────────────────────────
    // Note RGPD : on GARDE les lignes `orders` (obligation comptable 10 ans,
    // art. L123-22 Code de commerce) mais on MINIMISE (art. 17) en anonymisant la
    // seule PII qu'elles contiennent — `email` — par un placeholder. La facture
    // identifiante complète (nom + adresse) est conservée par Stripe ; la
    // réconciliation comptable reste possible via amount/created_at/stripe_*_id.
    // Les commandes où il est referrer_id (= achats de tiers) gardent l'email du
    // tiers (referrer_id est nullé par la FK ON DELETE SET NULL).
    const ANONYMIZED_EMAIL = 'deleted@anonymized.invalid';

    // Lien fiable membre → orders : l'email de checkout Stripe (orders.email) peut
    // différer de l'email d'auth (member.email) — l'order est rattachée au membre
    // par son `activation_code`, pas par email. On récupère donc ses codes AVANT de
    // les détacher (plus bas) pour anonymiser TOUTES ses commandes, y compris celles
    // payées sous un autre email.
    const { data: memberCodes } = await supabaseAdmin
      .from('activation_codes')
      .select('code')
      .eq('member_id', member.id);
    const activationCodes = (memberCodes ?? []).map(c => c.code);

    // audit_logs : on efface l'activité du membre (art. 17) MAIS on CONSERVE les
    // preuves de consentement / d'opérations RGPD — exactement les actions que la
    // migration 040 exempte de la purge temporelle (art. 7 + traçabilité des droits
    // exercés). Sans cette exclusion, la suppression du compte détruirait la preuve
    // que 040 cherche à garder. La FK `audit_logs.member_id … ON DELETE SET NULL`
    // détache ces lignes à la suppression du membre (plus bas) : preuve conservée
    // mais pseudonymisée, cohérent avec l'anonymisation des orders.
    // ⚠️ Garder synchronisé avec la liste NOT IN de migration 040.
    const RGPD_PROOF_ACTIONS = [
      'member.marketing_consent_changed',
      'member.data_exported',
      'member.deleted',
      'member.reclaimed',
    ];

    const deletes = [
      supabaseAdmin.from('messages').delete().eq('member_id', member.id),
      supabaseAdmin.from('scans').delete().eq('member_id', member.id),
      supabaseAdmin.from('silent_views').delete().eq('member_id', member.id),
      supabaseAdmin.from('push_subscriptions').delete().eq('member_id', member.id),
      supabaseAdmin.from('audit_logs').delete()
        .eq('member_id', member.id)
        .not('action', 'in', `(${RGPD_PROOF_ACTIONS.join(',')})`),
      supabaseAdmin.from('referrals').delete().eq('referrer_id', member.id),
      supabaseAdmin.from('feedback').delete().eq('member_id', member.id),
      supabaseAdmin.from('blocks').delete().eq('member_id', member.id),
      supabaseAdmin.from('activation_codes').update({ member_id: null }).eq('member_id', member.id),
      // Orders : conservées mais email anonymisé (minimisation). On couvre les deux
      // liens — codes d'activation ET email d'auth — pour ne laisser aucune commande
      // identifiante derrière, même si le checkout a utilisé un autre email.
      ...(activationCodes.length
        ? [supabaseAdmin.from('orders').update({ email: ANONYMIZED_EMAIL }).in('activation_code', activationCodes)]
        : []),
      // Newsletter (keyée par email) — pas d'obligation de rétention → erasure art. 17.
      ...(member.email ? [
        supabaseAdmin.from('newsletter_subscribers').delete().eq('email', member.email),
        supabaseAdmin.from('orders').update({ email: ANONYMIZED_EMAIL }).eq('email', member.email),
      ] : []),
    ];

    const results = await Promise.all(deletes);
    const failed = results.filter(r => r.error);
    if (failed.length) {
      console.error('[member/delete] Échec suppression partielle:', failed.map(r => r.error?.message));
    }

    // Trace la suppression dans un audit séparé (sans memberId puisque le profil
    // n'existe plus juste après — permet au support d'avoir une trace).
    audit({
      action:   'member.deleted',
      metadata: { deletedMemberId: member.id, partialErrors: failed.length },
    });

    // ─── Supprime le membre ─────────────────────────────────────────────
    const { error: memberDeleteErr } = await supabaseAdmin.from('members').delete().eq('id', member.id);
    if (memberDeleteErr) throw memberDeleteErr;

    // ─── Supprime le compte auth Supabase ──────────────────────────────
    await supabaseAdmin.auth.admin.deleteUser(auth.user.id);

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[member/delete]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
