// GET /api/member/export
// Droit à la portabilité RGPD (art. 20) : retourne TOUTES les données du
// membre authentifié dans un format JSON structuré et lisible.
//
// Le fichier inclut : profil, messages reçus (+ thread replies), scans,
// silent_views, push subscriptions, audit logs, orders, referrals envoyés.
//
// Ce qui est inclus côté « tiers » : les contacts (@insta/email), prénoms et
// noms de scanneurs que ces personnes ont CHOISI de partager AVEC le membre
// (sender_contact, sender_name, scanner_name) — ce sont des données reçues par
// le membre, légitimement portables.
//
// Données exclues volontairement :
//   - sender_token : identifiant technique pseudonyme du device d'un tiers (sert
//     uniquement au blocage côté serveur, n'est pas une donnée du membre).
//   - IDs internes des autres utilisateurs.
//   - Hash de password (jamais stocké en clair anyway, géré par Supabase Auth).
//
// Format : application/json avec Content-Disposition attachment.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { reportError } from '@/lib/report-error';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    // ─── Récupère le membre ────────────────────────────────────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // Lien fiable membre → orders : l'order est rattachée par `activation_code`,
    // pas par email — le checkout Stripe peut avoir utilisé un email différent de
    // l'email d'auth. On récupère donc les codes du membre pour exporter TOUTES ses
    // commandes (art. 20), même celles payées sous un autre email. Cf. member/delete.
    const { data: memberCodes } = await supabaseAdmin
      .from('activation_codes')
      .select('code')
      .eq('member_id', member.id);
    const activationCodes = (memberCodes ?? []).map(c => c.code);

    // ─── Fetch en parallèle toutes les données liées ─────────────────────
    const [
      { data: messages },
      { data: scans },
      { data: silentViews },
      { data: pushSubs },
      { data: auditLogs },
      { data: ordersByEmail },
      { data: ordersByCode },
      { data: referrals },
      { data: newsletter },
      { data: feedback },
    ] = await Promise.all([
      // Colonnes explicites : on EXCLUT sender_token (jeton device d'un tiers, le
      // scanneur — identifiant technique, pas une donnée du porteur). On INCLUT
      // sender_name (prénom partagé par le scanneur, affiché au porteur dans son
      // inbox/conversation → donnée reçue, portable).
      supabaseAdmin.from('messages')
        .select('id, member_id, content, sender_contact, sender_name, is_quick_reply, moderated, starred, read_at, created_at, parent_id, author, blocked_at')
        .eq('member_id', member.id).order('created_at', { ascending: true }),
      supabaseAdmin.from('scans').select('*').eq('member_id', member.id).order('scanned_at', { ascending: true }),
      supabaseAdmin.from('silent_views').select('*').eq('member_id', member.id).order('created_at', { ascending: true }),
      supabaseAdmin.from('push_subscriptions').select('endpoint, message_id, created_at').eq('member_id', member.id),
      supabaseAdmin.from('audit_logs').select('*').eq('member_id', member.id).order('created_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('orders').select('*').eq('email', (member.email ?? '').toLowerCase()).order('created_at', { ascending: true }),
      supabaseAdmin.from('orders').select('*').in('activation_code', activationCodes).order('created_at', { ascending: true }),
      supabaseAdmin.from('referrals').select('*').eq('referrer_id', member.id),
      supabaseAdmin.from('newsletter_subscribers').select('*').eq('email', (member.email ?? '').toLowerCase()),
      supabaseAdmin.from('feedback').select('*').eq('member_id', member.id).order('created_at', { ascending: true }),
    ]);

    // Fusion email + activation_code, dédoublonnée par id (une order peut matcher
    // les deux), triée par date pour un export stable.
    const ordersMap = new Map<string, Record<string, unknown>>();
    for (const o of [...(ordersByEmail ?? []), ...(ordersByCode ?? [])]) {
      ordersMap.set((o as { id: string }).id, o);
    }
    const orders = Array.from(ordersMap.values()).sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)),
    );

    audit({
      action:   'member.data_exported',
      memberId: member.id,
      metadata: { timestamp: new Date().toISOString() },
    });

    const payload = {
      $schema:       'inrealsociety/member-export-v1',
      exported_at:   new Date().toISOString(),
      exported_for:  auth.user.email,
      gdpr_notice:   'Ce fichier contient vos données personnelles stockées par In Real Society, conformément à votre droit à la portabilité (RGPD art. 20). Il inclut les contacts, prénoms et noms que des tiers (scanneurs) ont choisi de partager avec vous. Il exclut les identifiants techniques internes (jetons d\'appareil tiers, IDs internes). Pour demander la suppression de votre compte, utilisez le bouton "Supprimer mon compte" du dashboard.',
      profile:       member,
      messages:      messages ?? [],
      scans:         scans ?? [],
      silent_views:  silentViews ?? [],
      push_subscriptions: pushSubs ?? [],
      audit_logs:    auditLogs ?? [],
      orders:        orders ?? [],
      referrals_sent: referrals ?? [],
      feedback:       feedback ?? [],
      newsletter_subscriptions: newsletter ?? [],
    };

    const filename = `irs-export-${member.id}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type':        'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });

  } catch (err) {
    reportError('member/export', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
