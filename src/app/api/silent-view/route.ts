// app/api/silent-view/route.ts
// Vue silencieuse (sans email) — incrémente uniquement le compteur de scans.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkScanRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  memberId:    z.string().uuid(),
  scannerName: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }
    const { memberId, scannerName } = body.data;

    // ─── Rate limiting ────────────────────────────────────────────────────
    const ip = getIp(req);
    const rl = await checkScanRateLimit(ip, memberId);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Trop de requêtes.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // Vérifie que le membre existe
    const { data: member } = await supabase
      .from('members').select('id, is_paused').eq('id', memberId).single();

    if (!member) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    if (member.is_paused) return NextResponse.json({ ok: true, paused: true });

    const { error: insertError } = await supabaseAdmin.from('silent_views').insert({
      member_id:    memberId,
      scanner_name: scannerName || null,
    });
    if (insertError) throw insertError;

    const { error: rpcError } = await supabaseAdmin.rpc('increment_scan_count', { member_id: memberId });
    if (rpcError) console.warn('[silent-view] RPC increment failed:', rpcError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[silent-view]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}