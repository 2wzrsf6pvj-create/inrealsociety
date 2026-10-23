// src/lib/field-stats.ts — Chiffres du test terrain, pour /admin (choix de
// Clément) : porteurs activés et scannés, scans → messages → réponses,
// porteurs encore scannés après un mois, premium, commandes. Calculés depuis la
// base, sans PostHog : ils ne dépendent pas du consentement aux mesures.
// SERVEUR UNIQUEMENT.

import { supabaseAdmin } from '@/lib/supabase-admin';

const DAY = 86_400_000;

/** Fenêtre des chiffres d'activité : scans, messages, commandes. */
export const STATS_WINDOW_DAYS = 30;
/** Premiers jours d'un porteur : a-t-il été scanné dans ce délai ? */
export const FIRST_SCAN_DAYS = 14;
/** Ancienneté à partir de laquelle on regarde s'il est encore porté. */
export const STILL_WORN_AFTER_DAYS = 30;
/** « Encore porté » = scanné pendant ces derniers jours. */
export const RECENT_SCAN_DAYS = 14;
/** Porteurs pris en compte pour le premier scan (scans chargés sur cette durée). */
export const LOOKBACK_DAYS = 120;

export interface Ratio { eligible: number; hit: number }

export interface FieldStats {
  wearers:    number;
  newWearers: number;
  premium:    number;
  paidOrders: number;
  /** Activés entre J-120 et J-14 : scannés dans leurs 14 premiers jours. */
  firstScan:  Ratio;
  /** Activés depuis plus de 30 jours : scannés ces 14 derniers jours. */
  stillWorn:  Ratio;
  /** Sur la fenêtre : scans, premiers messages, conversations où le porteur a répondu. */
  funnel:     { scans: number; messages: number; replied: number };
}

export function computeFieldStats(input: {
  members:      { id: string; created_at: string; plan: string | null }[];
  scans:        { member_id: string; scanned_at: string }[];
  /** Premiers messages des passants (non filtrés), sur la fenêtre. */
  roots:        { id: string }[];
  /** parent_id des réponses de porteurs, sur la fenêtre. */
  replyParents: (string | null)[];
  paidOrders:   number;
}, now: Date): FieldStats {
  const ago = (days: number) => now.getTime() - days * DAY;

  const scansByMember = new Map<string, number[]>();
  for (const s of input.scans) {
    const times = scansByMember.get(s.member_id) ?? [];
    times.push(Date.parse(s.scanned_at));
    scansByMember.set(s.member_id, times);
  }

  const firstScan: Ratio = { eligible: 0, hit: 0 };
  const stillWorn: Ratio = { eligible: 0, hit: 0 };
  for (const m of input.members) {
    const activated = Date.parse(m.created_at);
    const times = scansByMember.get(m.id) ?? [];
    if (activated >= ago(LOOKBACK_DAYS) && activated <= ago(FIRST_SCAN_DAYS)) {
      firstScan.eligible++;
      if (times.some((at) => at >= activated && at <= activated + FIRST_SCAN_DAYS * DAY)) firstScan.hit++;
    }
    if (activated <= ago(STILL_WORN_AFTER_DAYS)) {
      stillWorn.eligible++;
      if (times.some((at) => at >= ago(RECENT_SCAN_DAYS))) stillWorn.hit++;
    }
  }

  const rootIds = new Set(input.roots.map((r) => r.id));
  const replied = new Set(input.replyParents.filter((p): p is string => !!p && rootIds.has(p)));
  return {
    wearers:    input.members.length,
    newWearers: input.members.filter((m) => Date.parse(m.created_at) >= ago(STATS_WINDOW_DAYS)).length,
    premium:    input.members.filter((m) => m.plan === 'premium').length,
    paidOrders: input.paidOrders,
    firstScan,
    stillWorn,
    funnel: {
      scans:    input.scans.filter((s) => Date.parse(s.scanned_at) >= ago(STATS_WINDOW_DAYS)).length,
      messages: rootIds.size,
      replied:  replied.size,
    },
  };
}

/** PostgREST plafonne chaque réponse (1 000 lignes par défaut chez Supabase) :
 *  lecture par pages, bornée. */
const PAGE = 1000;
const MAX_ROWS = 50_000;
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`[field-stats] ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function loadFieldStats(now = new Date()): Promise<FieldStats> {
  const since = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const [members, scans, roots, replies, paid] = await Promise.all([
    allRows<{ id: string; created_at: string; plan: string | null }>((from, to) =>
      supabaseAdmin.from('members').select('id, created_at, plan').order('id').range(from, to)),
    allRows<{ member_id: string; scanned_at: string }>((from, to) =>
      supabaseAdmin.from('scans').select('member_id, scanned_at')
        .gte('scanned_at', since(LOOKBACK_DAYS)).order('id').range(from, to)),
    allRows<{ id: string }>((from, to) =>
      supabaseAdmin.from('messages').select('id').is('parent_id', null).eq('moderated', false)
        .gte('created_at', since(STATS_WINDOW_DAYS)).order('id').range(from, to)),
    allRows<{ parent_id: string | null }>((from, to) =>
      supabaseAdmin.from('messages').select('parent_id').eq('author', 'member')
        .gte('created_at', since(STATS_WINDOW_DAYS)).order('id').range(from, to)),
    supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
      .eq('status', 'paid').gte('created_at', since(STATS_WINDOW_DAYS)),
  ]);
  if (paid.error) throw new Error(`[field-stats] ${paid.error.message}`);

  return computeFieldStats({
    members, scans, roots,
    replyParents: replies.map((r) => r.parent_id),
    paidOrders:   paid.count ?? 0,
  }, now);
}
