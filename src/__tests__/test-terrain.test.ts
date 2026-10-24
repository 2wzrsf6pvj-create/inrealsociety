// Test terrain (choix de Clément, 2026-10-24) :
// - /admin : semaine par semaine (lundi → dimanche, heure de Paris), suivi
//   porteur par porteur (chiffres seulement), avis jusqu'ici lus en SQL ;
// - un avis écrit depuis « Mon espace » est rattaché au porteur connecté,
//   jamais à l'identifiant envoyé par le navigateur ;
// - plus rien ne part du serveur vers PostHog : ces événements ignoraient le
//   consentement du porteur.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { computeFieldStats, parisWeekStart, FOLLOW_UP_MAX, WEEKS } from '@/lib/field-stats';

type Result = { data?: unknown; error?: { message: string } | null; count?: number };
type Call = { method: string; args: unknown[] };

// Base simulée : chaque requête note ses appels, sa réponse dépend de la table
// et des appels ; les insertions sont gardées.
const db = vi.hoisted(() => ({
  respond:  (() => ({ data: [], error: null })) as (table: string, calls: Call[]) => Result,
  inserted: [] as Record<string, unknown>[],
}));
vi.mock('@/lib/supabase-admin', () => {
  function query(table: string) {
    const calls: Call[] = [];
    const q: object = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
            Promise.resolve(db.respond(table, calls)).then(ok, ko);
        }
        return (...args: unknown[]) => {
          if (prop === 'insert') db.inserted.push(args[0] as Record<string, unknown>);
          calls.push({ method: String(prop), args });
          return q;
        };
      },
    });
    return q;
  }
  return { supabaseAdmin: { from: (table: string) => query(table) } };
});
vi.mock('@/lib/require-auth', () => ({ getOptionalUser: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: vi.fn(async () => ({ success: true })),
  getIp:                () => '203.0.113.9',
  rateLimitHeaders:     () => ({}),
}));

import { loadFeedbackDigest } from '@/lib/feedback-digest';
import { getOptionalUser } from '@/lib/require-auth';
import { POST as feedback } from '@/app/api/feedback/route';

const NOW = new Date('2026-10-23T12:00:00Z');   // vendredi, 14 h à Paris
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const member = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id, created_at: createdAt, plan: 'free', name: id, short_code: `qr-${id}`, is_paused: false, suspended_at: null,
  stripe_subscription_id: null as string | null, plan_expires_at: null as string | null, ...over,
});
const input = (over: Partial<Parameters<typeof computeFieldStats>[0]> = {}) => ({
  members: [], scans: [], roots: [], replyParents: [], paidOrders: 0, subscriptions: [], phones: null, ...over,
});

describe('semaines : du lundi au dimanche, heure de Paris', () => {
  it.each([
    ['2026-10-23T12:00:00Z', '2026-10-19', 'vendredi'],
    ['2026-10-18T22:30:00Z', '2026-10-19', 'dimanche 22 h 30 UTC : déjà lundi 0 h 30 à Paris'],
    ['2026-10-18T21:30:00Z', '2026-10-12', 'dimanche 23 h 30 à Paris'],
    ['2026-11-01T23:30:00Z', '2026-11-02', 'après le passage à l’heure d’hiver : lundi 0 h 30'],
    ['2026-11-01T22:30:00Z', '2026-10-26', 'après le passage à l’heure d’hiver : dimanche 23 h 30'],
  ])('%s → semaine du %s (%s)', (at, monday) => {
    expect(parisWeekStart(Date.parse(at))).toBe(monday);
  });

  const stats = computeFieldStats(input({
    members: [
      member('w1', '2026-10-14T09:00:00Z'),
      member('w2', '2026-10-20T09:00:00Z'),
      member('w3', '2026-09-01T09:00:00Z'),
    ],
    scans: [
      { member_id: 'w1', scanned_at: '2026-10-18T22:30:00Z' },   // lundi à Paris
      { member_id: 'w1', scanned_at: '2026-10-15T10:00:00Z' },
      { member_id: 'w3', scanned_at: '2026-10-13T10:00:00Z' },
      { member_id: 'w3', scanned_at: '2026-10-13T11:00:00Z' },   // même porteur, même semaine
    ],
    roots: [
      { id: 'r1', member_id: 'w1', created_at: '2026-10-19T08:00:00Z' },
      { id: 'r2', member_id: 'w3', created_at: '2026-10-12T08:00:00Z' },
    ],
    replyParents: ['r1'],
  }), NOW);

  it(`${WEEKS} semaines, la semaine en cours d’abord`, () => {
    expect(stats.weeks.map((w) => w.start)).toEqual([
      '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31',
    ]);
  });

  it('semaine en cours : porteurs activés à ce jour, scannés, messages et réponses', () => {
    expect(stats.weeks[0]).toEqual({ start: '2026-10-19', wearers: 3, newWearers: 1, scanned: 1, scans: 1, messages: 1, replied: 1 });
  });

  it('semaine précédente : un porteur scanné deux fois compte une fois', () => {
    expect(stats.weeks[1]).toEqual({ start: '2026-10-12', wearers: 2, newWearers: 1, scanned: 2, scans: 3, messages: 1, replied: 0 });
  });

  it('avant toute activité : le porteur déjà activé, sans scan', () => {
    expect(stats.weeks[7]).toEqual({ start: '2026-08-31', wearers: 1, newWearers: 1, scanned: 0, scans: 0, messages: 0, replied: 0 });
  });
});

describe('suivi des porteurs : chiffres seulement, les plus récents d’abord', () => {
  const stats = computeFieldStats(input({
    members: [
      member('ancien', daysAgo(70)),                                    // hors des 60 jours
      member('calme', daysAgo(20)),
      member('nouveau', daysAgo(2), { plan: 'premium', stripe_subscription_id: 'sub_1' }),
      member('pause', daysAgo(10), { is_paused: true }),
      member('suspendu', daysAgo(12), { is_paused: true, suspended_at: daysAgo(1) }),
    ],
    scans: [
      { member_id: 'nouveau', scanned_at: daysAgo(1) },
      { member_id: 'nouveau', scanned_at: daysAgo(0.5) },
      { member_id: 'calme', scanned_at: daysAgo(15) },
    ],
    roots: [
      { id: 'n1', member_id: 'nouveau', created_at: daysAgo(1) },
      { id: 'n2', member_id: 'nouveau', created_at: daysAgo(0.4) },
      { id: 'c1', member_id: 'calme', created_at: daysAgo(15) },
    ],
    replyParents: ['n1', 'n1', 'c1'],
    subscriptions: [{ member_id: 'nouveau', message_id: null, endpoint: 'https://web.push.apple.com/x' }],
    phones: [{ id: 'nouveau', phone_os: 'ios', app_installed_at: daysAgo(1) }, { id: 'calme', phone_os: 'android', app_installed_at: null }],
  }), NOW);

  it('activés ces 60 derniers jours, du plus récent au plus ancien', () => {
    expect(stats.followUp.map((w) => w.id)).toEqual(['nouveau', 'pause', 'suspendu', 'calme']);
  });

  it('scans, dont 7 derniers jours, dernier scan, messages et réponses, notifications, téléphone', () => {
    expect(stats.followUp[0]).toEqual({
      id: 'nouveau', name: 'nouveau', shortCode: 'qr-nouveau', activatedAt: daysAgo(2), days: 2,
      state: 'active', premium: { gift: false, until: null },
      scans: 2, recentScans: 2, lastScanAt: daysAgo(0.5),
      messages: 2, replied: 1,
      notified: true, phone: { os: 'ios', appInstalled: true },
    });
    expect(stats.followUp[3]).toEqual(expect.objectContaining({
      id: 'calme', days: 20, scans: 1, recentScans: 0, lastScanAt: daysAgo(15), messages: 1, replied: 1,
      notified: false, phone: { os: 'android', appInstalled: false },
    }));
  });

  it('en pause, suspendu ; téléphone pas encore relevé', () => {
    expect(stats.followUp.map((w) => w.state)).toEqual(['active', 'paused', 'suspended', 'active']);
    expect(stats.followUp[1]).toEqual(expect.objectContaining({ scans: 0, lastScanAt: null, phone: null }));
  });

  it(`${FOLLOW_UP_MAX} porteurs au plus`, () => {
    const many = Array.from({ length: FOLLOW_UP_MAX + 5 }, (_, i) => member(`p${i}`, daysAgo(i % 50)));
    expect(computeFieldStats(input({ members: many }), NOW).followUp).toHaveLength(FOLLOW_UP_MAX);
  });
});

describe('avis dans /admin', () => {
  beforeEach(() => { db.inserted.length = 0; });

  it('les derniers écrits, avec le porteur ; les notes de fin de conversation comptées', async () => {
    db.respond = (table, calls) => {
      const eq = (col: string) => calls.find((c) => c.method === 'eq' && c.args[0] === col)?.args[1];
      if (table === 'members') return { data: [{ id: 'm1', name: 'Lou' }], error: null };
      if (eq('type') === 'app') {
        return { data: [
          { id: 'f2', created_at: daysAgo(1), message: '  Les notifications arrivent en retard.  ', member_id: 'm1' },
          { id: 'f1', created_at: daysAgo(3), message: 'Top.', member_id: 'supprime' },
          { id: 'f0', created_at: daysAgo(4), message: 'Sans compte.', member_id: null },
        ], error: null };
      }
      return { count: { positive: 4, neutral: 1, negative: 2 }[eq('rating') as string], error: null };
    };
    const digest = await loadFeedbackDigest(NOW);
    expect(digest.notes).toEqual([
      { id: 'f2', createdAt: daysAgo(1), message: 'Les notifications arrivent en retard.', member: { id: 'm1', name: 'Lou' } },
      { id: 'f1', createdAt: daysAgo(3), message: 'Top.', member: null },
      { id: 'f0', createdAt: daysAgo(4), message: 'Sans compte.', member: null },
    ]);
    expect(digest.ratings).toEqual({ positive: 4, neutral: 1, negative: 2 });
  });

  it('une erreur de lecture fait échouer la page, comme les autres blocs', async () => {
    db.respond = () => ({ data: null, error: { message: 'timeout' } });
    await expect(loadFeedbackDigest(NOW)).rejects.toThrow('timeout');
  });
});

describe('« Votre avis » : rattaché au porteur connecté', () => {
  const send = (body: Record<string, unknown>) =>
    feedback({ json: async () => body } as unknown as NextRequest);
  beforeEach(() => {
    db.inserted.length = 0;
    db.respond = (table) => (table === 'members' ? { data: { id: 'm-connecte' }, error: null } : { data: null, error: null });
  });

  it('jamais à l’identifiant envoyé par le navigateur', async () => {
    (getOptionalUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'auth-1' });
    const res = await send({ type: 'app', message: 'Bonne idée.', memberId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
    expect(db.inserted).toEqual([expect.objectContaining({ type: 'app', message: 'Bonne idée.', member_id: 'm-connecte' })]);
  });

  it('sans session : enregistré sans porteur', async () => {
    (getOptionalUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await send({ type: 'app', message: 'Au nom de quelqu’un.', memberId: '11111111-1111-4111-8111-111111111111' });
    expect(db.inserted).toEqual([expect.objectContaining({ member_id: null })]);
  });
});

describe('PostHog : rien ne part du serveur', () => {
  const ROOT = path.resolve(__dirname, '../..');

  it('plus de bibliothèque PostHog serveur', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }['posthog-node']).toBeUndefined();
  });

  it('ni les routes ni lib/ (hors navigateur) n’importent PostHog', () => {
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
    const offenders = [...files(path.join(ROOT, 'src/app/api')), ...files(path.join(ROOT, 'src/lib'))]
      .filter((file) => !file.endsWith('posthog-client.ts'))
      .filter((file) => /from ['"](posthog-node|posthog-js|@\/lib\/posthog-client)['"]/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
