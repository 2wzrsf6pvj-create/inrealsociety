// src/app/api/member/update/route.ts
// PATCH { name, pitch, instagram } — met à jour le profil du membre authentifié.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { moderateProfileFields, profileRefusalMessage } from '@/lib/moderation';
import { reportError } from '@/lib/report-error';

const schema = z.object({
  name:              z.string().min(1).max(50).trim().optional(),
  pitch:             z.string().min(1).max(500).trim().optional(),
  instagram:         z.string().max(50).optional(),
  is_paused:         z.boolean().optional(),
  require_contact:   z.boolean().optional(),
  marketing_consent: z.boolean().optional(),
  scan_emails:       z.boolean().optional(),   // email au premier scan du jour (061)
});

export async function PATCH(req: NextRequest) {
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

    // ─── Vérifie ownership : récupère le membre lié à ce user ────────────
    // `*` plutôt que de nommer suspended_at : si le code est déployé avant la
    // migration 054, nommer la colonne ferait échouer TOUTE mise à jour de profil.
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // Profil suspendu par l'opérateur (ex. remboursement après activation) : la
    // pause ne se lève que côté support. La contrainte BDD (054) le garantit aussi.
    if (member.suspended_at && body.data.is_paused === false) {
      return NextResponse.json(
        { error: 'Profil suspendu\u00a0: contactez le support pour le réactiver.', code: 'suspended' },
        { status: 403 },
      );
    }

    const updateData: Record<string, unknown> = { ...body.data };
    // typeof string (PAS truthy) : '' doit passer pour permettre d'EFFACER l'insta.
    if (typeof updateData.instagram === 'string') {
      updateData.instagram = updateData.instagram.trim().replace(/^@/, '');
    }
    // RGPD : horodate explicitement le consentement marketing à chaque flip true
    if (body.data.marketing_consent === true) {
      updateData.marketing_consent_at = new Date().toISOString();
    } else if (body.data.marketing_consent === false) {
      updateData.marketing_consent_at = null;
    }

    // Textes publics (prénom, présentation, Instagram) : filtrés comme les
    // messages. Seuls les champs modifiés sont analysés : un texte déjà en ligne
    // ne bloque pas un autre réglage.
    const changed = (field: 'name' | 'pitch' | 'instagram') =>
      typeof updateData[field] === 'string' && updateData[field] !== member[field]
        ? updateData[field] as string
        : undefined;
    const refused = await moderateProfileFields({
      name: changed('name'), pitch: changed('pitch'), instagram: changed('instagram'),
    });
    if (refused) {
      audit({
        action:   'profile.moderated',
        memberId: member.id,
        ip:       getIp(req),
        metadata: { field: refused.field, source: refused.result.source, categories: refused.result.categories },
      });
      return NextResponse.json(
        { error: profileRefusalMessage(refused.field), code: 'moderated', field: refused.field },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update(updateData)
      .eq('id', member.id)
      .eq('auth_user_id', auth.user.id);

    if (updateError) {
      reportError('api/member/update', updateError);
      return NextResponse.json({ error: 'Erreur de mise à jour.' }, { status: 500 });
    }

    // RGPD : trace les changements de consentement marketing (preuve art. 7)
    if (body.data.marketing_consent !== undefined) {
      audit({
        action:   'member.marketing_consent_changed',
        memberId: member.id,
        ip:       getIp(req),
        metadata: { consent: body.data.marketing_consent },
      });

      // Réconciliation members → newsletter : si ce membre est aussi inscrit à
      // la newsletter (même email), on propage son choix pour qu'un opt-out ne
      // laisse aucun canal ouvert (et qu'un ré-opt-in le réactive). No-op s'il
      // n'a pas de ligne newsletter. email mis en minuscules (la table newsletter
      // stocke en lowercase). Ré-opt-in : on ré-horodate consented_at pour ne pas
      // laisser une preuve de consentement périmée sur la ligne ressuscitée.
      if (member.email) {
        const now = new Date().toISOString();
        await supabaseAdmin
          .from('newsletter_subscribers')
          .update(body.data.marketing_consent
            ? { unsubscribed_at: null, consented_at: now }
            : { unsubscribed_at: now })
          .eq('email', member.email.toLowerCase());
      }
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    reportError('api/member/update', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
