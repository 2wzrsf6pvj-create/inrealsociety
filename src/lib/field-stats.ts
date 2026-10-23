// src/lib/field-stats.ts — Chiffres du test terrain, pour /admin (choix de
// Clément) : porteurs activés et scannés, scans → messages → réponses,
// porteurs encore scannés après un mois, premium, commandes, notifications.
// Calculés depuis la base, sans PostHog : ils ne dépendent pas du consentement
// aux mesures. SERVEUR UNIQUEMENT.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isMissingColumn } from '@/lib/phone';
import { pushService, type PushService } from '@/lib/push-service';
import type { PhoneOs } from '@/lib/types';

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

/** Service de notifications du téléphone lui-même : l'app installée sur iPhone
 *  passe par Apple ; sur Android, Chrome et ses dérivés par Google, Firefox par
 *  Mozilla. Un ordinateur abonné par le même service compte aussi (Safari sur
 *  Mac, Chrome) : approximation assumée. */
export const PHONE_PUSH: Record<PhoneOs, PushService[]> = { ios: ['apple'], android: ['google', 'mozilla'] };

export interface NotificationStats {
  /** Porteurs dont au moins un appareil reçoit les notifications, dont par
   *  Apple et par Google. */
  wearers:  { notified: number; apple: number; google: number };
  /** Téléphone relevé à l'ouverture de « Mon espace » (cf. lib/phone) ; null
   *  tant que la migration 062 n'est pas appliquée. */
  phones:   { iphone: { total: number; installed: number; notified: number }; android: { total: number; notified: number } } | null;
  /** Premiers messages de la fenêtre dont le passant suit la réponse : il s'est
   *  abonné aux notifications de la conversation. */
  followed: number;
}

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
  notifications: NotificationStats;
}

export function computeFieldStats(input: {
  members:      { id: string; created_at: string; plan: string | null }[];
  scans:        { member_id: string; scanned_at: string }[];
  /** Premiers messages des passants (non filtrés), sur la fenêtre. */
  roots:        { id: string }[];
  /** parent_id des réponses de porteurs, sur la fenêtre. */
  replyParents: (string | null)[];
  paidOrders:   number;
  /** Abonnements aux notifications : d'un porteur (member_id) ou d'un passant
   *  à sa conversation (message_id). */
  subscriptions: { member_id: string | null; message_id: string | null; endpoint: string }[];
  /** Porteurs dont le téléphone est connu ; null sans la migration 062. */
  phones:       { id: string; phone_os: PhoneOs; app_installed_at: string | null }[] | null;
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
    notifications: notificationStats(input.subscriptions, input.phones, rootIds),
  };
}

function notificationStats(
  subscriptions: { member_id: string | null; message_id: string | null; endpoint: string }[],
  phones: { id: string; phone_os: PhoneOs; app_installed_at: string | null }[] | null,
  rootIds: Set<string>,
): NotificationStats {
  const servicesByMember = new Map<string, Set<PushService>>();
  const followed = new Set<string>();
  for (const s of subscriptions) {
    if (s.member_id) {
      const services = servicesByMember.get(s.member_id) ?? new Set<PushService>();
      services.add(pushService(s.endpoint));
      servicesByMember.set(s.member_id, services);
    } else if (s.message_id && rootIds.has(s.message_id)) {
      followed.add(s.message_id);
    }
  }
  const all = [...servicesByMember.values()];
  const reachesPhone = (id: string, os: PhoneOs) =>
    PHONE_PUSH[os].some((service) => servicesByMember.get(id)?.has(service));

  let byPhone: NotificationStats['phones'] = null;
  if (phones) {
    byPhone = { iphone: { total: 0, installed: 0, notified: 0 }, android: { total: 0, notified: 0 } };
    for (const p of phones) {
      const group = p.phone_os === 'ios' ? byPhone.iphone : byPhone.android;
      group.total++;
      if (reachesPhone(p.id, p.phone_os)) group.notified++;
      if (p.phone_os === 'ios' && p.app_installed_at) byPhone.iphone.installed++;
    }
  }
  return {
    wearers: {
      notified: all.length,
      apple:    all.filter((services) => services.has('apple')).length,
      google:   all.filter((services) => services.has('google')).length,
    },
    phones:   byPhone,
    followed: followed.size,
  };
}

/** PostgREST plafonne chaque réponse (1 000 lignes par défaut chez Supabase) :
 *  lecture par pages, bornée. */
const PAGE = 1000;
const MAX_ROWS = 50_000;
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw Object.assign(new Error(`[field-stats] ${error.message}`), { code: error.code });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

type PhoneRow = { id: string; phone_os: PhoneOs; app_installed_at: string | null };

/** Porteurs dont le téléphone est connu ; null tant que la migration 062 n'est
 *  pas appliquée (/admin le dit au lieu d'échouer). */
async function loadPhones(): Promise<PhoneRow[] | null> {
  try {
    return await allRows<PhoneRow>((from, to) =>
      supabaseAdmin.from('members').select('id, phone_os, app_installed_at')
        .not('phone_os', 'is', null).order('id').range(from, to));
  } catch (err) {
    if (isMissingColumn(err)) return null;
    throw err;
  }
}

export async function loadFieldStats(now = new Date()): Promise<FieldStats> {
  const since = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const [members, scans, roots, replies, paid, subscriptions, phones] = await Promise.all([
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
    allRows<{ member_id: string | null; message_id: string | null; endpoint: string }>((from, to) =>
      supabaseAdmin.from('push_subscriptions').select('member_id, message_id, endpoint').order('id').range(from, to)),
    loadPhones(),
  ]);
  if (paid.error) throw new Error(`[field-stats] ${paid.error.message}`);

  return computeFieldStats({
    members, scans, roots,
    replyParents: replies.map((r) => r.parent_id),
    paidOrders:   paid.count ?? 0,
    subscriptions,
    phones,
  }, now);
}
