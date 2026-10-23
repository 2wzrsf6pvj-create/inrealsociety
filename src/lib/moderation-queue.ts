// src/lib/moderation-queue.ts — Ce qu'affiche l'administration (/admin) :
// signalements et photos à traiter, appareils bannis, profils suspendus,
// dernières décisions. SERVEUR UNIQUEMENT (supabaseAdmin).
//
// « Traité » = une ligne moderation.report_handled dans audit_logs avec la clé
// du signalement : le journal d'audit sert aussi de registre des décisions,
// sans nouvelle table ni migration.

import { supabaseAdmin } from '@/lib/supabase-admin';

/** Au-delà, un signalement non traité sort de la liste (il reste dans l'audit). */
export const QUEUE_WINDOW_DAYS = 90;

/** Clé d'un élément à traiter : `message:<message_reports.id>`,
 *  `profile:<audit_logs.id>` ou `photo:<audit_logs.id>`. */
export const REPORT_KEY_RE = /^(message|profile|photo):[0-9a-f-]{36}$/;

/** Décisions affichées dans l'historique (le filtre automatique, très
 *  fréquent, n'y figure pas). */
export const HISTORY_ACTIONS = [
  'member.suspended', 'member.unsuspended', 'member.photo_removed',
  'device.banned', 'device.unbanned', 'device.auto_banned',
  'message.hidden', 'moderation.report_handled',
] as const;

export interface QueueMember { id: string; name: string | null; photoUrl: string | null; suspended: boolean }

export interface MessageReportItem {
  key: string; createdAt: string; member: QueueMember | null;
  messageId: string; content: string | null; senderToken: string | null;
  /** Porteurs différents ayant signalé cet appareil (dans la fenêtre). */
  reporters: number; banned: boolean;
}
export interface ProfileReportItem {
  key: string; createdAt: string; member: QueueMember | null;
  reason: string; contact: string | null; messageId: string | null;
}
export interface PhotoItem { key: string; createdAt: string; member: QueueMember }
export interface BannedDevice { senderToken: string; reason: string | null; createdAt: string }
export interface SuspendedMember { id: string; name: string | null; suspendedAt: string }
export interface Decision { action: string; createdAt: string; memberId: string | null; metadata: Record<string, unknown> }

export interface ModerationQueue {
  messageReports: MessageReportItem[];
  profileReports: ProfileReportItem[];
  photos:         PhotoItem[];
  banned:         BannedDevice[];
  suspended:      SuspendedMember[];
  decisions:      Decision[];
}

/** Éléments sans décision enregistrée. */
export function pending<T extends { key: string }>(items: T[], handled: Set<string>): T[] {
  return items.filter((item) => !handled.has(item.key));
}

/** Une ligne par porteur, la plus récente : une nouvelle photo remplace la
 *  précédente, seule la dernière reste à vérifier. Lignes triées du plus récent. */
export function latestPerMember<T extends { member_id: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.member_id || seen.has(row.member_id)) return false;
    seen.add(row.member_id);
    return true;
  });
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`[moderation-queue] ${what} : ${res.error.message}`);
  return (res.data ?? []) as T;
}

type Meta = Record<string, unknown> | null;
const text = (meta: Meta, key: string): string | null =>
  typeof meta?.[key] === 'string' ? meta[key] as string : null;

export async function loadModerationQueue(now = new Date()): Promise<ModerationQueue> {
  const since = new Date(now.getTime() - QUEUE_WINDOW_DAYS * 86_400_000).toISOString();
  const recent = <Q extends { gte: (col: string, v: string) => Q }>(q: Q) => q.gte('created_at', since);

  const [handledRes, reportsRes, profileRes, photoRes, bannedRes, suspendedRes, decisionsRes] = await Promise.all([
    recent(supabaseAdmin.from('audit_logs').select('metadata').eq('action', 'moderation.report_handled')),
    recent(supabaseAdmin.from('message_reports').select('id, message_id, member_id, sender_token, created_at'))
      .order('created_at', { ascending: false }).limit(200),
    recent(supabaseAdmin.from('audit_logs').select('id, member_id, metadata, created_at').eq('action', 'profile.reported'))
      .order('created_at', { ascending: false }).limit(200),
    recent(supabaseAdmin.from('audit_logs').select('id, member_id, created_at').eq('action', 'member.photo_updated'))
      .order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('banned_devices').select('sender_token, reason, created_at')
      .order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('members').select('id, name, suspended_at').not('suspended_at', 'is', null)
      .order('suspended_at', { ascending: false }).limit(200),
    supabaseAdmin.from('audit_logs').select('action, member_id, metadata, created_at').in('action', [...HISTORY_ACTIONS])
      .order('created_at', { ascending: false }).limit(30),
  ]);

  const handled = new Set(
    check<{ metadata: Meta }[]>(handledRes, 'décisions').map((r) => text(r.metadata, 'reportKey')).filter((k): k is string => !!k),
  );
  const reportRows  = check<{ id: string; message_id: string; member_id: string; sender_token: string | null; created_at: string }[]>(reportsRes, 'signalements de messages');
  const profileRows = check<{ id: string; member_id: string | null; metadata: Meta; created_at: string }[]>(profileRes, 'signalements de profils');
  const photoRows   = latestPerMember(check<{ id: string; member_id: string | null; created_at: string }[]>(photoRes, 'photos'));
  const bannedRows  = check<{ sender_token: string; reason: string | null; created_at: string }[]>(bannedRes, 'appareils bannis');

  // Contenus des messages et porteurs concernés, en deux requêtes.
  const messageIds = [...new Set(reportRows.map((r) => r.message_id))];
  const memberIds  = [...new Set([...reportRows, ...profileRows, ...photoRows].map((r) => r.member_id).filter((id): id is string => !!id))];
  const [messagesRes, membersRes] = await Promise.all([
    messageIds.length
      ? supabaseAdmin.from('messages').select('id, content').in('id', messageIds)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? supabaseAdmin.from('members').select('id, name, photo_url, suspended_at').in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const contents = new Map(check<{ id: string; content: string | null }[]>(messagesRes, 'messages').map((m) => [m.id, m.content]));
  const members = new Map(
    check<{ id: string; name: string | null; photo_url: string | null; suspended_at: string | null }[]>(membersRes, 'porteurs')
      .map((m) => [m.id, { id: m.id, name: m.name, photoUrl: m.photo_url, suspended: !!m.suspended_at }]),
  );
  const member = (id: string | null) => (id ? members.get(id) ?? null : null);

  const bannedTokens = new Set(bannedRows.map((b) => b.sender_token));
  const reportersByToken = new Map<string, number>();
  for (const r of reportRows) {
    if (r.sender_token) reportersByToken.set(r.sender_token, (reportersByToken.get(r.sender_token) ?? 0) + 1);
  }

  return {
    messageReports: pending(reportRows.map((r) => ({
      key:         `message:${r.id}`,
      createdAt:   r.created_at,
      member:      member(r.member_id),
      messageId:   r.message_id,
      content:     contents.get(r.message_id) ?? null,
      senderToken: r.sender_token,
      reporters:   r.sender_token ? reportersByToken.get(r.sender_token) ?? 0 : 0,
      banned:      !!r.sender_token && bannedTokens.has(r.sender_token),
    })), handled),
    profileReports: pending(profileRows.map((r) => ({
      key:       `profile:${r.id}`,
      createdAt: r.created_at,
      member:    member(r.member_id),
      reason:    text(r.metadata, 'reason') ?? '',
      contact:   text(r.metadata, 'contact'),
      messageId: text(r.metadata, 'messageId'),
    })), handled),
    // Photo déjà retirée depuis : plus rien à vérifier.
    photos: pending(photoRows.flatMap((r) => {
      const m = member(r.member_id);
      return m?.photoUrl ? [{ key: `photo:${r.id}`, createdAt: r.created_at, member: m }] : [];
    }), handled),
    banned: bannedRows.map((b) => ({ senderToken: b.sender_token, reason: b.reason, createdAt: b.created_at })),
    suspended: check<{ id: string; name: string | null; suspended_at: string }[]>(suspendedRes, 'profils suspendus')
      .map((m) => ({ id: m.id, name: m.name, suspendedAt: m.suspended_at })),
    decisions: check<{ action: string; member_id: string | null; metadata: Meta; created_at: string }[]>(decisionsRes, 'historique')
      .map((d) => ({ action: d.action, createdAt: d.created_at, memberId: d.member_id, metadata: d.metadata ?? {} })),
  };
}
