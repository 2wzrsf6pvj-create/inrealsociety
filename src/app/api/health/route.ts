// GET /api/health
// Endpoint de healthcheck pour monitoring externe (UptimeRobot, BetterStack, etc.)
// Retourne 200 si l'app répond + un ping rapide sur Supabase.
// Retourne 503 si Supabase est inaccessible.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SUPABASE_CONFIGURED } from '@/lib/supabase-config';

const START_TIME = Date.now();

export async function GET() {
  const checks: Record<string, 'ok' | 'fail' | 'skip'> = {
    app: 'ok',
  };

  // Ping Supabase (count vide pour minimiser la charge)
  if (SUPABASE_CONFIGURED) {
    try {
      const { error } = await supabaseAdmin
        .from('members')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      checks.supabase = error ? 'fail' : 'ok';
    } catch {
      checks.supabase = 'fail';
    }
  } else {
    checks.supabase = 'skip';
  }

  const allOk = Object.values(checks).every(v => v !== 'fail');

  return NextResponse.json({
    ok:        allOk,
    checks,
    uptimeMs:  Date.now() - START_TIME,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
