// GET /api/cron/cleanup
// Endpoint protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).
// Appelle la fonction Postgres cleanup_old_data() qui purge :
//  - audit_logs > 12 mois
//  - activation_codes non utilisés > 90 jours
//  - scans > 24 mois
//  - silent_views > 24 mois
//  - push_subscriptions > 90 jours (subs scanner orphelines)

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface CleanupResult {
  audit_logs_deleted:         number;
  activation_codes_deleted:   number;
  scans_deleted:              number;
  silent_views_deleted:       number;
  push_subscriptions_deleted: number;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
                 ?? req.headers.get('x-cron-secret');
  return provided === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_old_data').single();
    if (error) throw error;

    const result = data as unknown as CleanupResult;
    console.log('[cron/cleanup]', result);

    return NextResponse.json({ ok: true, deleted: result });
  } catch (err) {
    console.error('[cron/cleanup]', err);
    return NextResponse.json({ error: 'Erreur cleanup.' }, { status: 500 });
  }
}
