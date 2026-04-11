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
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
});

/** Reverse geocoding via Nominatim (OpenStreetMap) — gratuit, pas de clé API */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: { 'User-Agent': 'InRealSociety/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    // Construit un nom lisible : "quartier, ville" ou juste "ville"
    const parts = [
      addr.suburb || addr.neighbourhood || addr.quarter,
      addr.city || addr.town || addr.village || addr.municipality,
    ].filter(Boolean);

    return parts.length ? parts.join(', ') : (addr.state || addr.country || null);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { memberId, scannerName, latitude, longitude } = body.data;
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

    // ─── Reverse geocoding (non-bloquant) ──────────────────────────────
    let location: string | null = null;
    if (latitude != null && longitude != null) {
      location = await reverseGeocode(latitude, longitude);
    }

    // ─── Insertion scan ───────────────────────────────────────────────────
    const { error: scanError } = await supabaseAdmin.from('scans')
      .insert({
        member_id:    memberId,
        scanner_name: scannerName || null,
        latitude:     latitude ?? null,
        longitude:    longitude ?? null,
        location,
      });

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
      sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[api/scan] Échec envoi email:', err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/scan]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}