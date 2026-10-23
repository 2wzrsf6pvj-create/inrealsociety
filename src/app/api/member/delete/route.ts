// DELETE /api/member/delete
// Supprime le profil membre et le compte auth (RGPD).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { isActiveSubscriptionStatus } from '@/lib/subscription';
import { sendEmail, emailPremiumEnded } from '@/lib/email-templates';
import { PREMIUM_SETTINGS_URL } from '@/lib/premium';
import { formatDayFr } from '@/lib/dates';
import Stripe from 'stripe';
import { reportError } from '@/lib/report-error';

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
      .select('id, name, email, stripe_customer_id, stripe_subscription_id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // ─── 0. Résilie l'abonnement premium — DOIT réussir ─────────────────────
    // Avant, un échec chez Stripe était seulement logué : le compte disparaissait
    // et le prélèvement continuait chaque mois, sans tableau de bord pour l'arrêter.
    // On résilie donc TOUS les abonnements actifs du client (pas seulement celui
    // connu en base : un webhook en retard peut ne pas l'avoir encore enregistré),
    // et on n'efface rien si Stripe ne répond pas : l'utilisateur réessaie.
    let cancelled = 0;
    if (member.stripe_customer_id || member.stripe_subscription_id) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-03-25.dahlia',
        });
        // Client ou abonnement déjà supprimé chez Stripe : rien à résilier.
        const missingIsEmpty = (err: unknown) => {
          if ((err as { code?: string }).code === 'resource_missing') return [];
          throw err;
        };
        const subs = member.stripe_customer_id
          ? await stripe.subscriptions.list({ customer: member.stripe_customer_id, status: 'all', limit: 100 })
              .then((list) => list.data, missingIsEmpty)
          : await stripe.subscriptions.retrieve(member.stripe_subscription_id!)
              .then((sub) => [sub], missingIsEmpty);
        for (const sub of subs) {
          if (!isActiveSubscriptionStatus(sub.status)) continue;
          await stripe.subscriptions.cancel(sub.id);
          cancelled++;
        }
      } catch (err) {
        console.error('[member/delete] Résiliation Stripe impossible, suppression annulée:', err);
        return NextResponse.json(
          { error: 'Impossible de résilier votre abonnement premium pour le moment : votre compte n\'a pas été supprimé. Réessayez dans quelques minutes.' },
          { status: 502 },
        );
      }
    }

    // Confirmation de la résiliation (Code de la consommation, L215-1-1), envoyée
    // ici : le webhook customer.subscription.deleted trouvera un membre déjà
    // gratuit (ou supprimé) et n'enverra pas un second email.
    if (cancelled > 0) {
      const { error: freeErr } = await supabaseAdmin.from('members')
        .update({ plan: 'free', stripe_subscription_id: null, plan_expires_at: null })
        .eq('id', member.id);
      if (freeErr) console.error('[member/delete] Passage en gratuit avant suppression:', freeErr.message);
    }
    if (cancelled > 0 && member.email) {
      const { subject, html } = emailPremiumEnded({
        name: member.name, endedOn: formatDayFr(new Date()), settingsUrl: PREMIUM_SETTINGS_URL, accountDeleted: true,
      });
      const sent = await sendEmail({ to: member.email, subject, html });
      if (!sent) console.error('[member/delete] Échec email de résiliation');
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
    // ⚠️ Garder synchronisé avec la liste NOT IN de cleanup_old_data (migration 046).
    // member.activated = preuve de consentement §8/9 (CGV + renonciation service) :
    // doit SURVIVRE à la suppression (détachée par la FK SET NULL), sinon on détruit
    // la preuve au moment même où l'utilisateur exerce son droit à l'effacement.
    const RGPD_PROOF_ACTIONS = [
      'member.marketing_consent_changed',
      'member.data_exported',
      'member.deleted',
      'member.reclaimed',
      'member.activated',
    ];

    // ─── 1. Effacement PII NON-CASCADE — DOIT réussir ───────────────────────
    // Ces lignes ne sont PAS purgées par le cascade de `members` : les orders sont
    // conservées (compta 10 ans) avec seulement l'email anonymisé, et
    // newsletter_subscribers n'a aucune FK vers members. Si l'un de ces effacements
    // échoue, l'email BRUT (PII) survivrait. On ABORT alors en 500 AVANT de supprimer
    // le membre/compte auth → l'utilisateur peut réessayer plutôt que de recevoir un
    // faux « compte supprimé » pendant que sa PII persiste. Emails en lowercase
    // (orders/newsletter stockent en minuscules — cf. checkout/newsletter).
    const emailLc = member.email?.toLowerCase() ?? null;
    const piiOps = [
      ...(activationCodes.length
        ? [supabaseAdmin.from('orders').update({ email: ANONYMIZED_EMAIL }).in('activation_code', activationCodes)]
        : []),
      ...(emailLc ? [
        supabaseAdmin.from('orders').update({ email: ANONYMIZED_EMAIL }).eq('email', emailLc),
        supabaseAdmin.from('newsletter_subscribers').delete().eq('email', emailLc),
      ] : []),
    ];
    const piiResults = await Promise.all(piiOps);
    const piiFailed = piiResults.filter(r => r.error);
    if (piiFailed.length) {
      reportError('member/delete', new Error(`Effacement PII non-cascade échoué : ${piiFailed.map(r => r.error?.message).join(' ; ')}`));
      return NextResponse.json(
        { error: 'La suppression n\'a pas pu être complétée entièrement. Réessayez.' },
        { status: 500 },
      );
    }

    // ─── 2. Nettoyages cascade-backed (best-effort) ─────────────────────────
    // Toutes ces tables sont FK vers members (CASCADE ou SET NULL) → même si un
    // delete explicite échoue, la suppression du membre (plus bas) les purge. On
    // efface explicitement pour l'immédiateté ; les erreurs sont loguées, non bloquantes.
    const cascadeOps = [
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
    ];
    const cascadeResults = await Promise.all(cascadeOps);
    const cascadeFailed = cascadeResults.filter(r => r.error);
    if (cascadeFailed.length) {
      console.error('[member/delete] Nettoyage cascade partiel (rattrapé par le cascade du membre):', cascadeFailed.map(r => r.error?.message));
    }

    // Trace la suppression dans un audit séparé (sans memberId puisque le profil
    // n'existe plus juste après — permet au support d'avoir une trace).
    audit({
      action:   'member.deleted',
      metadata: { deletedMemberId: member.id, partialErrors: cascadeFailed.length },
    });

    // ─── Supprime le membre ─────────────────────────────────────────────
    const { error: memberDeleteErr } = await supabaseAdmin.from('members').delete().eq('id', member.id);
    if (memberDeleteErr) throw memberDeleteErr;

    // ─── Supprime le compte auth Supabase ──────────────────────────────
    await supabaseAdmin.auth.admin.deleteUser(auth.user.id);

    return NextResponse.json({ ok: true });

  } catch (err) {
    reportError('member/delete', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
