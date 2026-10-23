// Mesurer les notifications (choix de Clément) :
// - /admin : porteurs prévenus, iPhone (app installée) et Android, passants qui
//   suivent leur conversation ; dans la recherche, notifications et téléphone
//   de chaque porteur. Sans la migration 062, /admin le dit au lieu d'échouer ;
// - téléphone relevé à l'ouverture de « Mon espace », app installée reconnue à
//   son adresse de départ (?src=app), que le proxy fait suivre depuis « / » ;
// - déconnexion : l'appareil cessait d'être abonné… jamais. Il recevait encore
//   l'aperçu des messages du porteur ;
// - un passant qui suivait une nouvelle conversation depuis le même appareil
//   gardait la date de son premier abonnement : la purge l'emportait.
// La purge elle-même (abonnements des porteurs gardés) : integration/tunnel.test.ts.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { pushService } from '@/lib/push-service';
import { phoneOs, phoneUpdate, recordPhone, isMissingColumn } from '@/lib/phone';
import { computeFieldStats, loadFieldStats } from '@/lib/field-stats';
import { searchAdmin } from '@/lib/order-watch';
import { unsubscribePush, UNSUBSCRIBE_TIMEOUT_MS } from '@/lib/push-client';
import { DELETE as unsubscribeRoute, POST as subscribeRoute } from '@/app/api/push/subscribe/route';
import DashboardPage from '@/app/dashboard/page';
import type { Member } from '@/lib/types';

type Result = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };
type Call = { table: string; method: string; args: unknown[] };

// Base simulée : chaque requête est notée, sa réponse dépend de la table et des
// appels (select…). Les écritures lancées sans attendre sont gardées.
const db = vi.hoisted(() => ({
  calls:   [] as Call[],
  pending: [] as Promise<unknown>[],
  respond: (() => ({ data: [], error: null })) as (table: string, calls: Call[]) => Result,
  user:    { id: 'auth-1', email: 'lou@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' },
  member:  null as unknown,
  ua:      '',
}));

vi.mock('@/lib/supabase-admin', () => {
  function query(table: string) {
    const own: Call[] = [];
    const q: object = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          const result = db.respond(table, own);
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko);
        }
        return (...args: unknown[]) => {
          const call = { table, method: String(prop), args };
          own.push(call);
          db.calls.push(call);
          return q;
        };
      },
    });
    return q;
  }
  return { supabaseAdmin: { from: (table: string) => query(table) } };
});
vi.mock('@/lib/wait-until', () => ({ waitUntil: (p: Promise<unknown>) => { db.pending.push(p); } }));
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: vi.fn(async () => ({ success: true, limit: 10, remaining: 9, reset: 0 })),
  getIp: () => '203.0.113.7',
  rateLimitHeaders: () => ({}),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'user-agent': db.ua }) }));
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: db.user } }) } }),
}));
vi.mock('@/lib/supabase', () => ({ getMemberByAuthUserId: async () => db.member }));
vi.mock('@/lib/queries-server', () => ({
  getRecentScans: async () => [], getScansByDay: async () => [], getScanCountSince: async () => 0,
  claimOrphanedMember: async () => null,
}));
vi.mock('@/lib/inbox', () => ({
  getMessages: async () => [], getMessagesCount: async () => 0, getActiveConversationsCount: async () => 0,
  getConversationsTotal: async () => 0, getUnreadMessagesCount: async () => 0,
}));
vi.mock('@/app/dashboard/[memberId]/DashboardClient', () => ({ default: () => null }));
// Porteur connecté, pour le proxy.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) } }),
}));

const NOW = new Date('2026-10-23T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const APPLE   = 'https://web.push.apple.com/QGa1';
const FCM     = 'https://fcm.googleapis.com/fcm/send/abc';
const FIREFOX = 'https://updates.push.services.mozilla.com/wpush/v2/x';
const EDGE    = 'https://wns2-par02p.notify.windows.com/w/?token=x';

const UA = {
  iphone:     'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneApp:  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  chromeIos:  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1',
  android:    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsung:    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  mac:        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  windows:    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

beforeEach(() => {
  db.calls = [];
  db.pending = [];
  db.respond = () => ({ data: [], error: null });
});

describe('service de notifications, lu dans l’adresse d’abonnement', () => {
  it.each([
    [APPLE, 'apple'],
    [FCM, 'google'],
    ['https://android.googleapis.com/gcm/send/abc', 'google'],
    [FIREFOX, 'mozilla'],
    [EDGE, 'microsoft'],
    ['https://apple.com.example.net/x', 'other'],
    ['https://notapple.com/x', 'other'],
    ['pas une adresse', 'other'],
  ])('%s → %s', (endpoint, service) => {
    expect(pushService(endpoint)).toBe(service);
  });
});

describe('téléphone du porteur', () => {
  it.each([
    ['iPhone, Safari', UA.iphone, 'ios'],
    ['iPhone, app installée', UA.iphoneApp, 'ios'],
    ['iPhone, Chrome', UA.chromeIos, 'ios'],
    ['Android, Chrome', UA.android, 'android'],
    ['Android, Samsung Internet', UA.samsung, 'android'],
    ['Mac (et iPad récent)', UA.mac, null],
    ['Windows', UA.windows, null],
    ['sans user-agent', null, null],
  ])('%s', (_label, ua, os) => {
    expect(phoneOs(ua)).toBe(os);
  });

  const known = (over: Partial<Member> = {}): Pick<Member, 'phone_os' | 'app_installed_at'> =>
    ({ phone_os: null, app_installed_at: null, ...over });

  it('premier passage depuis un iPhone : relevé ; même téléphone ensuite : rien à écrire', () => {
    expect(phoneUpdate(known(), UA.iphone, false, NOW)).toEqual({ phone_os: 'ios' });
    expect(phoneUpdate(known({ phone_os: 'ios' }), UA.iphone, false, NOW)).toBeNull();
  });

  it('passé sur Android : le dernier téléphone l’emporte', () => {
    expect(phoneUpdate(known({ phone_os: 'ios' }), UA.android, false, NOW)).toEqual({ phone_os: 'android' });
  });

  it('première ouverture depuis l’app installée : datée une fois, jamais réécrite', () => {
    expect(phoneUpdate(known({ phone_os: 'ios' }), UA.iphoneApp, true, NOW)).toEqual({ app_installed_at: NOW.toISOString() });
    expect(phoneUpdate(known({ phone_os: 'ios', app_installed_at: daysAgo(3) }), UA.iphoneApp, true, NOW)).toBeNull();
  });

  it('ordinateur, même depuis une app installée : rien n’est relevé', () => {
    expect(phoneUpdate(known(), UA.windows, true, NOW)).toBeNull();
  });

  it('migration 062 pas appliquée (colonnes absentes du profil) : rien n’est relevé', () => {
    expect(phoneUpdate({}, UA.iphone, true, NOW)).toBeNull();
  });

  it('écriture sans attendre, et un échec ne casse rien', async () => {
    const member = { id: 'm1', phone_os: null, app_installed_at: null } as Member;
    db.respond = () => ({ error: { code: 'PGRST204', message: 'colonne inconnue' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordPhone(member, UA.iphone, false, NOW);
    expect(db.pending).toHaveLength(1);
    await Promise.all(db.pending);
    expect(db.calls.map((c) => [c.table, c.method, c.args[0]])).toEqual([
      ['members', 'update', { phone_os: 'ios' }],
      ['members', 'eq', 'id'],
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rien à écrire : aucune requête', () => {
    recordPhone({ id: 'm1', phone_os: 'ios', app_installed_at: null } as Member, UA.iphone, false, NOW);
    expect(db.calls).toEqual([]);
  });

  it('colonne inconnue (42703) : migration absente ; autre erreur : non', () => {
    expect(isMissingColumn({ code: '42703', message: 'column members.phone_os does not exist' })).toBe(true);
    expect(isMissingColumn({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false);
    expect(isMissingColumn(null)).toBe(false);
  });
});

describe('« Mon espace » relève le téléphone', () => {
  const member = { id: 'm1', plan: 'free', phone_os: null, app_installed_at: null };
  const open = (search: Record<string, string>) => DashboardPage({ searchParams: Promise.resolve(search) });

  beforeEach(() => { db.member = { ...member }; });

  it('ouvert depuis l’app installée sur iPhone : téléphone et première ouverture', async () => {
    db.ua = UA.iphoneApp;
    await open({ src: 'app' });
    await Promise.all(db.pending);
    const update = db.calls.find((c) => c.method === 'update');
    expect(update?.args[0]).toEqual({ phone_os: 'ios', app_installed_at: expect.any(String) });
    expect(db.calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'm1']);
  });

  it('dans le navigateur : le téléphone seulement', async () => {
    db.ua = UA.android;
    await open({});
    expect(db.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ phone_os: 'android' });
  });

  it('depuis un ordinateur : aucune écriture', async () => {
    db.ua = UA.mac;
    await open({ src: 'app' });
    expect(db.calls).toEqual([]);
  });
});

describe('chiffres de /admin : notifications', () => {
  const members = ['i1', 'i2', 'i3', 'a1', 'a2', 'a3', 'd1', 'n1'].map((id) => ({ id, created_at: daysAgo(60), plan: 'free' }));
  const sub = (member_id: string | null, endpoint: string, message_id: string | null = null) => ({ member_id, message_id, endpoint });
  const input = {
    members, scans: [], roots: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], replyParents: [], paidOrders: 0,
    subscriptions: [
      sub('i1', APPLE),
      sub('i3', FCM),                       // Chrome sur ordinateur : pas prévenu sur son iPhone
      sub('a1', FCM), sub('a1', `${FCM}2`), // deux appareils : un porteur
      sub('a2', EDGE),                      // Edge sur Windows : pas sur son téléphone
      sub('a3', FIREFOX),
      sub('d1', `${APPLE}2`), sub('d1', `${FCM}3`),
      sub(null, 'https://web.push.apple.com/p1', 'm1'),
      sub(null, 'https://fcm.googleapis.com/fcm/send/p2', 'm1'), // même conversation, deux appareils
      sub(null, 'https://fcm.googleapis.com/fcm/send/p3', 'ancienne'),
    ],
    phones: [
      { id: 'i1', phone_os: 'ios' as const, app_installed_at: daysAgo(5) },
      { id: 'i2', phone_os: 'ios' as const, app_installed_at: daysAgo(9) },
      { id: 'i3', phone_os: 'ios' as const, app_installed_at: null },
      { id: 'a1', phone_os: 'android' as const, app_installed_at: null },
      { id: 'a2', phone_os: 'android' as const, app_installed_at: null },
      { id: 'a3', phone_os: 'android' as const, app_installed_at: null },
    ],
  };

  it('porteurs prévenus : au moins un appareil abonné, par Apple et par Google', () => {
    expect(computeFieldStats(input, NOW).notifications.wearers).toEqual({ notified: 6, apple: 2, google: 3 });
  });

  it('iPhone : app installée, et prévenus par Apple ; Android : prévenus par Google ou Mozilla', () => {
    expect(computeFieldStats(input, NOW).notifications.phones).toEqual({
      iphone:  { total: 3, installed: 2, notified: 1 },
      android: { total: 3, notified: 2 },
    });
  });

  it('passants : conversations de la fenêtre suivies, une fois chacune', () => {
    expect(computeFieldStats(input, NOW).notifications.followed).toBe(1);
  });

  it('sans la migration 062 : pas de chiffres par téléphone, le reste est là', () => {
    const stats = computeFieldStats({ ...input, phones: null }, NOW).notifications;
    expect(stats.phones).toBeNull();
    expect(stats.wearers.notified).toBe(6);
  });

  /** Base de test : colonnes 062 absentes si `missing`. */
  function respondWith(missing: boolean): (table: string, calls: Call[]) => Result {
    return (table, calls) => {
      const select = String(calls.find((c) => c.method === 'select')?.args[0] ?? '');
      if (table === 'members' && select.includes('phone_os')) {
        return missing
          ? { data: null, error: { code: '42703', message: 'column members.phone_os does not exist' } }
          : { data: [{ id: 'm1', phone_os: 'ios', app_installed_at: daysAgo(2) }], error: null };
      }
      if (table === 'members') {
        return { data: [{ id: 'm1', name: 'Lou', email: 'lou@example.com', created_at: daysAgo(10), plan: 'free', is_paused: false, suspended_at: null, short_code: 'k7p2q' }], error: null };
      }
      if (table === 'push_subscriptions') return { data: [{ member_id: 'm1', message_id: null, endpoint: APPLE }], error: null };
      if (table === 'orders') return { data: [], error: null, count: 0 };
      return { data: [], error: null };
    };
  }

  it('lecture sans la migration 062 : /admin s’affiche, « migration à appliquer »', async () => {
    db.respond = respondWith(true);
    const stats = await loadFieldStats(NOW);
    expect(stats.notifications.phones).toBeNull();
    expect(stats.notifications.wearers).toEqual({ notified: 1, apple: 1, google: 0 });
  });

  it('lecture avec la migration : téléphones comptés', async () => {
    db.respond = respondWith(false);
    expect((await loadFieldStats(NOW)).notifications.phones?.iphone).toEqual({ total: 1, installed: 1, notified: 1 });
  });

  it('toute autre erreur de lecture fait toujours échouer la page', async () => {
    db.respond = (table, calls) => (table === 'members' && String(calls[0]?.args[0]).includes('phone_os')
      ? { data: null, error: { code: '57014', message: 'timeout' } }
      : respondWith(false)(table, calls));
    await expect(loadFieldStats(NOW)).rejects.toThrow('timeout');
  });

  it('recherche : notifications du porteur, et téléphone si la migration est appliquée', async () => {
    db.respond = respondWith(false);
    const [hit] = (await searchAdmin('lou'))!.members;
    expect(hit).toEqual(expect.objectContaining({ id: 'm1', pushServices: ['apple'], phone: { os: 'ios', appInstalledAt: daysAgo(2) } }));

    db.respond = respondWith(true);
    const [withoutPhone] = (await searchAdmin('lou'))!.members;
    expect(withoutPhone.pushServices).toEqual(['apple']);
    expect(withoutPhone).not.toHaveProperty('phone');
  });
});

describe('déconnexion : l’appareil n’est plus abonné', () => {
  function browser({ existing = true, hang = false } = {}) {
    const sub = { endpoint: FCM, unsubscribe: vi.fn(async () => true) };
    const fetch = vi.fn(() => (hang ? new Promise<Response>(() => {}) : Promise.resolve(new Response(null, { status: 200 }))));
    vi.stubGlobal('navigator', { serviceWorker: {
      getRegistration: vi.fn(async () => ({ pushManager: { getSubscription: vi.fn(async () => (existing ? sub : null)) } })),
    } });
    vi.stubGlobal('fetch', fetch);
    return { sub, fetch };
  }

  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('le serveur oublie l’abonnement, le navigateur le résilie', async () => {
    const { sub, fetch } = browser();
    await unsubscribePush();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, JSON.parse(String(init.body))]).toEqual(['/api/push/subscribe', 'DELETE', { endpoint: FCM }]);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('pas d’abonnement sur cet appareil : rien à faire', async () => {
    const { fetch } = browser({ existing: false });
    await unsubscribePush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('réseau bloqué : la déconnexion n’attend pas plus de 3 secondes', async () => {
    vi.useFakeTimers();
    const { sub } = browser({ hang: true });
    const done = unsubscribePush();
    await vi.advanceTimersByTimeAsync(UNSUBSCRIBE_TIMEOUT_MS);
    await expect(done).resolves.toBeUndefined();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('navigateur sans service worker : rien', async () => {
    vi.stubGlobal('navigator', {});
    await expect(unsubscribePush()).resolves.toBeUndefined();
  });
});

describe('proxy : porteur connecté sur « / »', () => {
  it.each([
    ['/?src=app', '/dashboard?src=app'],   // app installée depuis une page du site
    ['/', '/dashboard'],
    ['/?src=autre', '/dashboard'],
  ])('%s → %s', async (from, to) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
    const { proxy } = await import('@/proxy');
    const res = await proxy(new NextRequest(`http://localhost:3000${from}`));
    expect(res.headers.get('location')).toBe(`http://localhost:3000${to}`);
    vi.unstubAllEnvs();
  });
});

describe('route des abonnements', () => {
  const del = (body: unknown) => unsubscribeRoute(new NextRequest('http://localhost/api/push/subscribe', {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));

  it('DELETE : supprime l’abonnement de cet endpoint, sans session', async () => {
    const res = await del({ endpoint: FCM });
    expect(res.status).toBe(200);
    expect(db.calls.map((c) => [c.table, c.method, ...c.args])).toEqual([
      ['push_subscriptions', 'delete'],
      ['push_subscriptions', 'eq', 'endpoint', FCM],
    ]);
  });

  it('DELETE sans endpoint valable : refusé, rien n’est supprimé', async () => {
    expect((await del({ endpoint: 'pas une adresse' })).status).toBe(400);
    expect((await del(null)).status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it('nouvel abonnement d’un passant : la purge de 90 jours repart de ce jour', async () => {
    db.respond = () => ({ data: null, error: null });
    const before = Date.now();
    const res = await subscribeRoute(new NextRequest('http://localhost/api/push/subscribe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: { endpoint: FCM, keys: { p256dh: 'p', auth: 'a' } }, messageId: '541c253f-592d-4f6e-8de6-d32676a72df1' }),
    }));
    expect(res.status).toBe(200);
    const row = db.calls.find((c) => c.method === 'upsert')!.args[0] as { created_at: string };
    expect(Date.parse(row.created_at)).toBeGreaterThanOrEqual(before);
  });
});
