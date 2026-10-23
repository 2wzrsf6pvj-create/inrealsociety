// GET /api/health
// Endpoint de healthcheck pour monitoring externe (UptimeRobot, BetterStack, etc.)
// Retourne 200 si l'app répond + un ping rapide sur Supabase et sur Upstash.
// Retourne 503 si l'un des deux est inaccessible (ou Upstash absent en
// production : sans lui, scanner un QR et écrire répondent 500).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SUPABASE_CONFIGURED } from '@/lib/supabase-config';
import { pingRedis } from '@/lib/ratelimit';

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

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    checks.upstash = (await pingRedis()) ? 'ok' : 'fail';
  } else {
    checks.upstash = process.env.VERCEL_ENV === 'production' ? 'fail' : 'skip';
  }

  const allOk = Object.values(checks).every(v => v !== 'fail');

  return NextResponse.json({
    ok:        allOk,
    checks,
    uptimeMs:  Date.now() - START_TIME,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
