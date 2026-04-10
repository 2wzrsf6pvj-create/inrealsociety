// src/app/api/scan/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauScan } from '@/lib/email-templates';
import { checkScanRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';

const schema = z.object({
  memberId:    z.string().uuid(),
  scannerName: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    const { memberId, scannerName } = body.data;
    const ip = getIp(req);

    // ─── Rate limiting double : IP + membre cible ─────────────────────────
    const rateLimit = await checkScanRateLimit(ip, memberId);
    if (!rateLimit.success) {
      audit({
        action:   'scan.rate_limited',
        memberId,
        ip,
        metadata: { reason: rateLimit.reason },
      });
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    // ─── Vérification membre ──────────────────────────────────────────────
    const { data: member } = await supabase
      .from('members')
      .select('id, name, email, is_paused')
      .eq('id', memberId)
      .single();

    if (!member) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    if (member.is_paused) return NextResponse.json({ ok: true, paused: true });

    // ─── Insertion scan ───────────────────────────────────────────────────
    const { error: scanError } = await supabaseAdmin.from('scans')
      .insert({ member_id: memberId, scanner_name: scannerName || null });

    if (scanError && scanError.code !== '23505') throw scanError;

    const { error: rpcError } = await supabaseAdmin.rpc('increment_scan_count', { member_id: memberId });
    if (rpcError) console.warn('[api/scan] RPC failed');

    // ─── Audit ────────────────────────────────────────────────────────────
    audit({
      action:   'scan.recorded',
      memberId,
      ip,
      metadata: { scannerName, duplicate: !!scanError },
    });

    // ─── Notification email ───────────────────────────────────────────────
    if (!scanError && member.email) {
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${member.id}`;
      const { subject, html } = emailNouveauScan({
        memberName:   member.name,
        scannerName,
        dashboardUrl,
      });
      sendEmail({ to: member.email, subject, html }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/scan]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}