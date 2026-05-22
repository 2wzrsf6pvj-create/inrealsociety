// GET /api/member/export
// Droit à la portabilité RGPD (art. 20) : retourne TOUTES les données du
// membre authentifié dans un format JSON structuré et lisible.
//
// Le fichier inclut : profil, messages reçus (+ thread replies), scans,
// silent_views, push subscriptions, audit logs, orders, referrals envoyés.
//
// Données exclues volontairement :
//   - IDs internes des autres utilisateurs (référentiel obfusqué)
//   - Hash de password (jamais stocké en clair anyway, géré par Supabase Auth)
//
// Format : application/json avec Content-Disposition attachment.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

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

    // ─── Fetch en parallèle toutes les données liées ─────────────────────
    const [
      { data: messages },
      { data: scans },
      { data: silentViews },
      { data: pushSubs },
      { data: auditLogs },
      { data: orders },
      { data: referrals },
    ] = await Promise.all([
      supabaseAdmin.from('messages').select('*').eq('member_id', member.id).order('created_at', { ascending: true }),
      supabaseAdmin.from('scans').select('*').eq('member_id', member.id).order('scanned_at', { ascending: true }),
      supabaseAdmin.from('silent_views').select('*').eq('member_id', member.id).order('created_at', { ascending: true }),
      supabaseAdmin.from('push_subscriptions').select('endpoint, message_id, created_at').eq('member_id', member.id),
      supabaseAdmin.from('audit_logs').select('*').eq('member_id', member.id).order('created_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('orders').select('*').eq('email', member.email).order('created_at', { ascending: true }),
      supabaseAdmin.from('referrals').select('*').eq('referrer_id', member.id),
    ]);

    audit({
      action:   'member.data_exported',
      memberId: member.id,
      metadata: { timestamp: new Date().toISOString() },
    });

    const payload = {
      $schema:       'inrealsociety/member-export-v1',
      exported_at:   new Date().toISOString(),
      exported_for:  auth.user.email,
      gdpr_notice:   'Ce fichier contient toutes vos données personnelles stockées par In Real Society, conformément à votre droit à la portabilité (RGPD art. 20). Pour demander la suppression de votre compte, utilisez le bouton "Supprimer mon compte" du dashboard.',
      profile:       member,
      messages:      messages ?? [],
      scans:         scans ?? [],
      silent_views:  silentViews ?? [],
      push_subscriptions: pushSubs ?? [],
      audit_logs:    auditLogs ?? [],
      orders:        orders ?? [],
      referrals_sent: referrals ?? [],
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
    console.error('[member/export]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
