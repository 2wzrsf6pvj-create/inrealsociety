// src/app/api/scan/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauScan } from '@/lib/email-templates';
import { checkScanRateLimit, isNewScan, releaseScanDedup, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { captureServerEvent } from '@/lib/posthog-server';
import { moderateContent } from '@/lib/moderation';
import { isValidFirstName } from '@/lib/validators';

const schema = z.object({
  memberId:    z.string().uuid(),
  scannerName: z.string().max(100).nullish(),  // le client envoie null si absent (.optional() rejetterait null)
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
});

/** Coordonnées arrondies à 2 décimales (~1 km) : assez pour trouver la ville. */
const roundForCity = (n: number) => Math.round(n * 100) / 100;

/**
 * Nom de la ville via Nominatim (OpenStreetMap) — gratuit, pas de clé API.
 * Le passant a accepté de partager sa « ville approximative » : seule une position
 * arrondie (~1 km) quitte le serveur, et seule la ville est gardée.
 */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // Timeout dur : Nominatim est dans le chemin de la requête de scan. Sans ça,
    // un service externe lent/bloqué fait traîner (voire timeout plateforme) la
    // réponse de scan. 2,5 s suffisent ; au-delà on renonce à la géoloc (non-bloquant).
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${roundForCity(lat)}&lon=${roundForCity(lng)}&zoom=10&addressdetails=1`,
      { headers: { 'User-Agent': 'InRealSociety/1.0' }, signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    return addr.city || addr.town || addr.village || addr.municipality || addr.state || addr.country || null;
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

    // ─── Reverse geocoding (non-bloquant) + prénom du passant ────────────
    // Le prénom est affiché au porteur (email « … vient de voir votre profil »,
    // tableau de bord) et ce point d'accès est public : format prénom imposé ici
    // (le client se contourne), puis modération. Invalide ou signalé → ignoré, le
    // scan reste enregistré, sans prénom. Les deux appels réseau en parallèle.
    const rawName = scannerName?.trim() || '';
    const [location, nameAccepted] = await Promise.all([
      latitude != null && longitude != null ? reverseGeocode(latitude, longitude) : Promise.resolve(null),
      isValidFirstName(rawName) ? moderateContent(rawName).then((m) => !m.flagged) : Promise.resolve(false),
    ]);
    const cleanName = nameAccepted ? rawName : null;

    // ─── Enregistrement atomique (insert scan + incrément scan_count) ──────
    // Seule la ville est conservée : aucune coordonnée n'est stockée
    // (minimisation RGPD ; record_scan les ignore aussi depuis la 058).
    // record_scan (migration 034) fait l'insert + l'incrément dans une seule
    // transaction → plus de dérive possible de scan_count.
    const { error: scanError } = await supabaseAdmin.rpc('record_scan', {
      p_member_id:    memberId,
      p_scanner_name: cleanName,
      p_latitude:     null,
      p_longitude:    null,
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
      metadata: { scannerName: cleanName, nameDropped: !!rawName && !cleanName },
    });

    // ─── Notifications ────────────────────────────────────────────────────
    // Attendues, pas en tâche de fond : une fonction serverless peut s'arrêter
    // dès la réponse envoyée, et l'envoi se perdrait (cf. /api/report).
    const notifications: Promise<unknown>[] = [
      // Rétention (P0) : event keyé sur le PORTEUR (distinctId = member_id).
      // Mesure « le porteur est-il encore scanné N semaines après ? » dans PostHog,
      // seulement sur un scan NEUF (les doublons sont déjà filtrés).
      captureServerEvent({
        distinctId: memberId,
        event:      'member_scanned',
        properties: { member_id: memberId, has_location: latitude != null && longitude != null },
      }).catch(() => {}),
    ];

    if (member.email) {
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${member.id}`;
      const { subject, html } = emailNouveauScan({
        memberName:   member.name,
        scannerName:  cleanName ?? undefined,  // le template attend string|undefined
        dashboardUrl,
      });
      notifications.push(
        sendEmail({ to: member.email, subject, html }).catch((err) => console.error('[api/scan] Échec envoi email:', err)),
      );
    }

    await Promise.all(notifications);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/scan]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}