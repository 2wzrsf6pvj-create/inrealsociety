// GET /api/cron/cleanup
// Endpoint protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).
// Appelle la fonction Postgres cleanup_old_data() (migration 058) qui purge :
//  - audit_logs > 12 mois (traces d'abus : 24 mois ; preuves RGPD : 5 ans)
//  - activation_codes non utilisés > 90 jours
//  - scans > 24 mois
//  - silent_views > 24 mois
//  - push_subscriptions > 90 jours (subs scanner orphelines)
//  - conversations dont le dernier message a plus de 12 mois

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { reportError } from '@/lib/report-error';

interface CleanupResult {
  audit_logs_deleted:         number;
  activation_codes_deleted:   number;
  scans_deleted:              number;
  silent_views_deleted:       number;
  push_subscriptions_deleted: number;
  conversations_deleted:      number;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('cleanup_old_data').single();
    if (error) throw error;

    const result = data as unknown as CleanupResult;
    console.log('[cron/cleanup]', result);

    return NextResponse.json({ ok: true, deleted: result });
  } catch (err) {
    reportError('cron/cleanup', err);
    return NextResponse.json({ error: 'Erreur cleanup.' }, { status: 500 });
  }
}
