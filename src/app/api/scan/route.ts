// src/app/api/scan/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauScan } from '@/lib/email-templates';
import { checkScanRateLimit, isNewScan, releaseScanDedup, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { captureServerEvent } from '@/lib/posthog-server';

const schema = z.object({
  memberId:    z.string().uuid(),
  scannerName: z.string().max(100).nullish(),  // le client envoie null si absent (.optional() rejetterait null)
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
});

/** Reverse geocoding via Nominatim (OpenStreetMap) — gratuit, pas de clé API */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // Timeout dur : Nominatim est dans le chemin de la requête de scan. Sans ça,
    // un service externe lent/bloqué fait traîner (voire timeout plateforme) la
    // réponse de scan. 2,5 s suffisent ; au-delà on renonce à la géoloc (non-bloquant).
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: { 'User-Agent': 'InRealSociety/1.0' }, signal: AbortSignal.timeout(2500) }
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
      console.warn('[api/scan] validation échouée:', body.error.flatten().fieldErrors);
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
    // admin : lit email (revoke pour anon en 026) pour la notification.
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, name, email, is_paused')
      .eq('id', memberId)
      .single();

    if (!member) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    if (member.is_paused) return NextResponse.json({ ok: true, paused: true });

    // ─── Déduplication : un rechargement de /profil par le même scanneur
    // (IP + membre, fenêtre 30 min) ne re-compte pas, ne ré-insère pas et ne
    // ré-emaile pas. scan_count reflète des rencontres uniques, pas des vues.
    if (!(await isNewScan(memberId, ip))) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // ─── Reverse geocoding (non-bloquant) ──────────────────────────────
    let location: string | null = null;
    if (latitude != null && longitude != null) {
      location = await reverseGeocode(latitude, longitude);
    }

    // ─── Enregistrement atomique (insert scan + incrément scan_count) ──────
    // Coordonnées arrondies à 3 décimales (~110 m) avant stockage : on garde
    // l'info de quartier (cf. `location`) sans pinpointer un lieu précis —
    // minimisation RGPD, cohérent avec la politique « géoloc approximative ».
    // record_scan (migration 034) fait l'insert + l'incrément dans une seule
    // transaction → plus de dérive possible de scan_count.
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const { error: scanError } = await supabaseAdmin.rpc('record_scan', {
      p_member_id:    memberId,
      p_scanner_name: scannerName || null,
      p_latitude:     latitude != null ? round3(latitude) : null,
      p_longitude:    longitude != null ? round3(longitude) : null,
      p_location:     location,
    });

    if (scanError) {
      // L'écriture a échoué alors que `isNewScan` a déjà consommé le créneau de
      // dédup → on le libère pour qu'un retry ne soit pas vu « doublon » et perdu.
      await releaseScanDedup(memberId, ip);
      throw scanError;
    }

    // ─── Audit ────────────────────────────────────────────────────────────
    audit({
      action:   'scan.recorded',
      memberId,
      ip,
      metadata: { scannerName },
    });

    // ─── Rétention (P0) : event keyé sur le PORTEUR (distinctId = member_id) ──
    // Mesure « le porteur est-il encore scanné N semaines après ? » dans PostHog.
    // Fire-and-forget, seulement sur un scan NEUF (les doublons sont déjà filtrés).
    captureServerEvent({
      distinctId: memberId,
      event:      'member_scanned',
      properties: { member_id: memberId, has_location: latitude != null && longitude != null },
    }).catch(() => {});

    // ─── Notification email ───────────────────────────────────────────────
    if (member.email) {
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${member.id}`;
      const { subject, html } = emailNouveauScan({
        memberName:   member.name,
        scannerName:  scannerName ?? undefined,  // .nullish() → null possible, le template attend string|undefined
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