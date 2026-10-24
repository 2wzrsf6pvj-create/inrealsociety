// src/lib/field-stats.ts — Chiffres du test terrain, pour /admin (choix de
// Clément) : porteurs activés et scannés, scans → messages → réponses,
// porteurs encore scannés après un mois, premium, commandes, notifications ;
// semaine par semaine, et porteur par porteur (chiffres seulement, jamais le
// contenu des messages). Calculés depuis la base, sans PostHog : ils ne
// dépendent pas du consentement aux mesures. SERVEUR UNIQUEMENT.

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
/** Semaine par semaine : la semaine en cours et les précédentes, du lundi au
 *  dimanche, heure de Paris. */
export const WEEKS = 8;
/** Suivi par porteur : activés ces derniers jours… */
export const FOLLOW_UP_DAYS = 60;
/** …dans cette limite, les plus récents d'abord. */
export const FOLLOW_UP_MAX = 50;
/** Suivi par porteur : scans de ces derniers jours ; sans scan sur cette durée,
 *  le porteur est signalé (« pas scanné depuis… »). */
export const RECENT_DAYS = 7;
/** Messages chargés : la fenêtre, les semaines et le suivi par porteur. */
const MESSAGES_DAYS = Math.max(STATS_WINDOW_DAYS, WEEKS * 7, FOLLOW_UP_DAYS);

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

/** Une semaine (lundi → dimanche, heure de Paris). */
export interface WeekStats {
  /** Lundi de la semaine, AAAA-MM-JJ. */
  start:      string;
  /** Porteurs activés à la fin de la semaine (aujourd'hui pour la semaine en cours). */
  wearers:    number;
  /** Porteurs activés pendant la semaine. */
  newWearers: number;
  /** Porteurs scannés au moins une fois pendant la semaine. */
  scanned:    number;
  scans:      number;
  /** Premiers messages des passants. */
  messages:   number;
  /** Parmi eux, ceux auxquels le porteur a répondu (depuis). */
  replied:    number;
}

/** Un porteur récent, pour le suivre pendant le test : chiffres seulement. */
export interface WearerFollowUp {
  id:          string;
  name:        string | null;
  shortCode:   string | null;
  activatedAt: string;
  /** Jours depuis l'activation (J0 le jour même). */
  days:        number;
  state:       'active' | 'paused' | 'suspended';
  premium:     boolean;
  scans:       number;
  /** Scans des RECENT_DAYS derniers jours. */
  recentScans: number;
  lastScanAt:  string | null;
  /** Premiers messages reçus, et ceux auxquels il a répondu. */
  messages:    number;
  replied:     number;
  /** Au moins un appareil abonné aux notifications. */
  notified:    boolean;
  /** null : téléphone pas encore relevé (ou migration 062 absente). */
  phone:       { os: PhoneOs; appInstalled: boolean } | null;
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
  /** La semaine en cours d'abord. */
  weeks:      WeekStats[];
  /** Porteurs activés ces FOLLOW_UP_DAYS derniers jours, les plus récents d'abord. */
  followUp:   WearerFollowUp[];
}

type MemberRow = {
  id: string; created_at: string; plan: string | null; name: string | null;
  short_code: string | null; is_paused: boolean | null; suspended_at: string | null;
};
type RootRow = { id: string; member_id: string; created_at: string };

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Lundi (AAAA-MM-JJ, heure de Paris) de la semaine d'un instant. */
export function parisWeekStart(at: number): string {
  const [y, m, d] = PARIS_DAY.format(at).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Date AAAA-MM-JJ décalée d'un nombre de jours. */
function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** parisWeekStart, calculé une fois par heure : le décalage de Paris tient en
 *  heures entières, tous les instants d'une heure UTC tombent le même jour. */
function weekOfInstant(): (at: number) => string {
  const HOUR = 3_600_000;
  const byHour = new Map<number, string>();
  return (at) => {
    const hour = Math.floor(at / HOUR);
    let week = byHour.get(hour);
    if (week === undefined) {
      week = parisWeekStart(hour * HOUR);
      byHour.set(hour, week);
    }
    return week;
  };
}

export function computeFieldStats(input: {
  members:      MemberRow[];
  scans:        { member_id: string; scanned_at: string }[];
  /** Premiers messages des passants (non filtrés), sur MESSAGES_DAYS. */
  roots:        RootRow[];
  /** parent_id des réponses de porteurs, sur MESSAGES_DAYS. */
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

  const answered = new Set(input.replyParents.filter((p): p is string => !!p));
  const rootIds = new Set(input.roots.filter((r) => Date.parse(r.created_at) >= ago(STATS_WINDOW_DAYS)).map((r) => r.id));
  const replied = [...rootIds].filter((id) => answered.has(id));
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
      replied:  replied.length,
    },
    notifications: notificationStats(input.subscriptions, input.phones, rootIds),
    weeks:    weekStats(input.members, input.scans, input.roots, answered, now),
    followUp: followUp(input.members, scansByMember, input.roots, answered, input.subscriptions, input.phones, now),
  };
}

function weekStats(
  members: MemberRow[],
  scans: { member_id: string; scanned_at: string }[],
  roots: RootRow[],
  answered: Set<string>,
  now: Date,
): WeekStats[] {
  const weekOf = weekOfInstant();
  const current = weekOf(now.getTime());
  const weeks: WeekStats[] = Array.from({ length: WEEKS }, (_, i) => ({
    start: shiftDay(current, -7 * i), wearers: 0, newWearers: 0, scanned: 0, scans: 0, messages: 0, replied: 0,
  }));
  const byStart = new Map(weeks.map((w) => [w.start, w]));

  for (const m of members) {
    const activated = weekOf(Date.parse(m.created_at));
    for (const w of weeks) {
      if (activated <= w.start) w.wearers++;
      if (activated === w.start) w.newWearers++;
    }
  }
  const scannedBy = new Map<string, Set<string>>();
  for (const s of scans) {
    const w = byStart.get(weekOf(Date.parse(s.scanned_at)));
    if (!w) continue;
    w.scans++;
    scannedBy.set(w.start, (scannedBy.get(w.start) ?? new Set()).add(s.member_id));
  }
  for (const w of weeks) w.scanned = scannedBy.get(w.start)?.size ?? 0;
  for (const r of roots) {
    const w = byStart.get(weekOf(Date.parse(r.created_at)));
    if (!w) continue;
    w.messages++;
    if (answered.has(r.id)) w.replied++;
  }
  return weeks;
}

function followUp(
  members: MemberRow[],
  scansByMember: Map<string, number[]>,
  roots: RootRow[],
  answered: Set<string>,
  subscriptions: { member_id: string | null }[],
  phones: { id: string; phone_os: PhoneOs; app_installed_at: string | null }[] | null,
  now: Date,
): WearerFollowUp[] {
  const since = now.getTime() - FOLLOW_UP_DAYS * DAY;
  const recentSince = now.getTime() - RECENT_DAYS * DAY;
  const notified = new Set(subscriptions.map((s) => s.member_id).filter((id): id is string => !!id));
  const phoneById = new Map((phones ?? []).map((p) => [p.id, p]));
  const rootsByMember = new Map<string, RootRow[]>();
  for (const r of roots) {
    const list = rootsByMember.get(r.member_id);
    if (list) list.push(r);
    else rootsByMember.set(r.member_id, [r]);
  }

  return members
    .filter((m) => Date.parse(m.created_at) >= since)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, FOLLOW_UP_MAX)
    .map((m) => {
      const times = scansByMember.get(m.id) ?? [];
      const received = rootsByMember.get(m.id) ?? [];
      const phone = phoneById.get(m.id);
      return {
        id: m.id, name: m.name, shortCode: m.short_code, activatedAt: m.created_at,
        days:  Math.floor((now.getTime() - Date.parse(m.created_at)) / DAY),
        state: m.suspended_at ? 'suspended' : m.is_paused ? 'paused' : 'active',
        premium:     m.plan === 'premium',
        scans:       times.length,
        recentScans: times.filter((at) => at >= recentSince).length,
        lastScanAt:  times.length ? new Date(times.reduce((a, b) => Math.max(a, b))).toISOString() : null,
        messages:    received.length,
        replied:     received.filter((r) => answered.has(r.id)).length,
        notified:    notified.has(m.id),
        phone:       phone ? { os: phone.phone_os, appInstalled: !!phone.app_installed_at } : null,
      };
    });
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
    allRows<MemberRow>((from, to) =>
      supabaseAdmin.from('members').select('id, created_at, plan, name, short_code, is_paused, suspended_at')
        .order('id').range(from, to)),
    allRows<{ member_id: string; scanned_at: string }>((from, to) =>
      supabaseAdmin.from('scans').select('member_id, scanned_at')
        .gte('scanned_at', since(LOOKBACK_DAYS)).order('id').range(from, to)),
    allRows<RootRow>((from, to) =>
      supabaseAdmin.from('messages').select('id, member_id, created_at').is('parent_id', null).eq('moderated', false)
        .gte('created_at', since(MESSAGES_DAYS)).order('id').range(from, to)),
    allRows<{ parent_id: string | null }>((from, to) =>
      supabaseAdmin.from('messages').select('parent_id').eq('author', 'member')
        .gte('created_at', since(MESSAGES_DAYS)).order('id').range(from, to)),
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
