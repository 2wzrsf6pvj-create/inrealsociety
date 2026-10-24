// Origine d'un achat (choix de Clément) : le passant qui suit, depuis le profil
// d'un porteur, le lien vers la boutique, puis achète sur le même appareil dans
// les 30 jours, laisse ce porteur noté sur sa commande. /admin compte ces
// achats, en tout et par porteur, depuis la base (sans PostHog, donc sans
// dépendre du consentement). La boutique ne casse jamais pour autant : origine
// illisible ignorée, migration 063 absente, la commande passe sans elle.
// Sur une vraie base (purge à 24 mois, compte supprimé) : integration/tunnel.test.ts.

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { scanOrigin, forgetScanOrigin, shopFromProfile, SCAN_ORIGIN_DAYS } from '@/lib/scan-origin';
import { computeFieldStats, loadFieldStats } from '@/lib/field-stats';

type Result = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };
type Call = { table: string; method: string; args: unknown[] };

// Base simulée : chaque requête est notée, sa réponse dépend de la table et des appels.
const db = vi.hoisted(() => ({
  calls:   [] as Call[][],
  respond: (() => ({ data: [], error: null })) as (table: string, calls: Call[]) => Result,
}));

vi.mock('@/lib/supabase-admin', () => {
  function query(table: string) {
    const own: Call[] = [];
    db.calls.push(own);
    const q: object = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          const result = db.respond(table, own);
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko);
        }
        return (...args: unknown[]) => {
          own.push({ table, method: String(prop), args });
          return q;
        };
      },
    });
    return q;
  }
  return { supabaseAdmin: { from: (table: string) => query(table) } };
});
vi.mock('stripe', () => {
  class StripeError extends Error {}
  return {
    default: class {
      static errors = { StripeError };
      checkout = { sessions: { create: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/cs_test_1' }) } };
    },
  };
});
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: async () => ({ success: true }),
  getIp:                () => '203.0.113.7',
  rateLimitHeaders:     () => ({}),
}));
vi.mock('@/lib/require-auth', () => ({ getOptionalUser: async () => null }));
vi.mock('@/lib/referral', () => ({ resolveReferrer: async () => null }));
vi.mock('@/lib/report-error', () => ({ reportError: vi.fn() }));

const WEARER = '9b2f6a1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER  = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const DAY = 86_400_000;

/** localStorage du navigateur, en mémoire ; `blocked` : navigation privée stricte. */
function storage({ blocked = false } = {}) {
  const items = new Map<string, string>();
  const guard = () => { if (blocked) throw new DOMException('Accès refusé', 'SecurityError'); };
  vi.stubGlobal('localStorage', {
    getItem:    (k: string) => { guard(); return items.get(k) ?? null; },
    setItem:    (k: string, v: string) => { guard(); items.set(k, String(v)); },
    removeItem: (k: string) => { guard(); items.delete(k); },
  });
  return items;
}

describe('boutique : le porteur d’origine, gardé 30 jours sur l’appareil', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lien depuis le profil : /shop?from=<porteur>', () => {
    expect(shopFromProfile(WEARER)).toBe(`/shop?from=${WEARER}`);
  });

  it('arrivée par le lien : retenu ; retour sur /shop sans le lien pendant 30 jours : toujours là', () => {
    storage();
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(scanOrigin(WEARER, now)).toBe(WEARER);
    expect(scanOrigin(null, now + 29 * DAY)).toBe(WEARER);
    expect(scanOrigin(null, now + SCAN_ORIGIN_DAYS * DAY)).toBeNull();
  });

  it('un autre profil ensuite : le dernier l’emporte, ses 30 jours repartent', () => {
    storage();
    const now = Date.parse('2026-10-24T12:00:00Z');
    scanOrigin(WEARER, now);
    expect(scanOrigin(OTHER, now + 20 * DAY)).toBe(OTHER);
    expect(scanOrigin(null, now + 45 * DAY)).toBe(OTHER);
  });

  it('valeur illisible, dans l’URL ou sur l’appareil : ignorée', () => {
    const items = storage();
    expect(scanOrigin('pas-un-identifiant')).toBeNull();
    items.set('scan_origin', '{oops');
    expect(scanOrigin(null)).toBeNull();
    items.set('scan_origin', JSON.stringify({ memberId: 'x', at: Date.now() }));
    expect(scanOrigin(null)).toBeNull();
  });

  it('stockage bloqué : l’URL seule compte, rien ne casse', () => {
    storage({ blocked: true });
    expect(scanOrigin(WEARER)).toBe(WEARER);
    expect(scanOrigin(null)).toBeNull();
    expect(() => forgetScanOrigin()).not.toThrow();
  });

  it('achat fait : oublié, une commande suivante ne lui revient pas', () => {
    storage();
    scanOrigin(WEARER);
    forgetScanOrigin();
    expect(scanOrigin(null)).toBeNull();
  });
});

describe('commande : le porteur d’origine noté par le serveur', () => {
  let POST: typeof import('@/app/api/shop/checkout/route').POST;
  /** Lignes que la route a tenté d'insérer dans orders, dans l'ordre. */
  const inserted = () => db.calls.flat().filter((c) => c.table === 'orders' && c.method === 'insert').map((c) => c.args[0] as Record<string, unknown>);

  beforeAll(async () => {
    vi.stubEnv('STRIPE_PRICE_ID', 'price_tee');   // lu au chargement de la route
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inrealsociety.test');
    ({ POST } = await import('@/app/api/shop/checkout/route'));
  });
  afterAll(() => { vi.unstubAllEnvs(); });

  /** Porteurs connus : WEARER (lou@…). Insert : `insertError` au premier essai. */
  function respond({ insertError }: { insertError?: { code: string; message: string } } = {}) {
    let attempts = 0;
    db.respond = (table, calls) => {
      if (table === 'members') {
        const id = calls.find((c) => c.method === 'eq')?.args[1];
        return { data: id === WEARER ? { id: WEARER, email: 'lou@example.com' } : null, error: null };
      }
      if (table === 'orders' && calls.some((c) => c.method === 'insert')) {
        attempts++;
        return attempts === 1 && insertError ? { data: null, error: insertError } : { data: { id: 'order-1' }, error: null };
      }
      return { data: null, error: null };
    };
  }
  beforeEach(() => { db.calls = []; respond(); });

  const buy = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost:3000/api/shop/checkout', {
    method: 'POST', body: JSON.stringify({ email: 'jeanne@example.com', tshirtColor: 'dark', tshirtSize: 'M', ...body }),
  }));

  it('profil d’un porteur : noté sur la commande', async () => {
    expect((await buy({ fromMemberId: WEARER })).status).toBe(200);
    expect(inserted()).toEqual([expect.objectContaining({ email: 'jeanne@example.com', from_member_id: WEARER })]);
  });

  it('sans origine, porteur inconnu, ou le porteur qui s’achète un t-shirt : rien de noté', async () => {
    for (const body of [{}, { fromMemberId: OTHER }, { fromMemberId: WEARER, email: 'Lou@Example.com' }]) {
      db.calls = [];
      expect((await buy(body)).status).toBe(200);
      expect(inserted()).toHaveLength(1);
      expect(inserted()[0]).not.toHaveProperty('from_member_id');
    }
  });

  it('origine illisible : ignorée, l’achat passe', async () => {
    for (const fromMemberId of ['pas-un-identifiant', 42, null]) {
      db.calls = [];
      expect((await buy({ fromMemberId })).status).toBe(200);
      expect(inserted()[0]).not.toHaveProperty('from_member_id');
    }
  });

  it('migration 063 pas encore appliquée : la commande passe, sans son origine', async () => {
    respond({ insertError: { code: 'PGRST204', message: "Could not find the 'from_member_id' column of 'orders' in the schema cache" } });
    expect((await buy({ fromMemberId: WEARER })).status).toBe(200);
    expect(inserted()).toHaveLength(2);
    expect(inserted()[1]).not.toHaveProperty('from_member_id');
  });

  it('toute autre erreur : la commande échoue, sans second essai', async () => {
    respond({ insertError: { code: '23514', message: 'violates check constraint' } });
    expect((await buy({ fromMemberId: WEARER })).status).toBe(500);
    expect(inserted()).toHaveLength(1);
  });
});

describe('/admin : achats venus d’un scan, en tout et par porteur', () => {
  const NOW = new Date('2026-10-24T12:00:00Z');
  const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();
  const member = (id: string) => ({
    id, created_at: daysAgo(20), plan: 'free', name: id, short_code: null, is_paused: false, suspended_at: null,
    stripe_subscription_id: null, plan_expires_at: null,
  });
  const input = {
    members: [member('lou'), member('sam')], scans: [], roots: [], replyParents: [], paidOrders: 5,
    subscriptions: [], phones: null,
  };

  it('ces 30 jours et depuis le début ; par porteur dans le suivi', () => {
    const stats = computeFieldStats({ ...input, scanOrders: [
      { from_member_id: 'lou', created_at: daysAgo(2) },
      { from_member_id: 'lou', created_at: daysAgo(40) },
      { from_member_id: 'sam', created_at: daysAgo(10) },
    ] }, NOW);
    expect(stats.fromScan).toEqual({ recent: 2, total: 3 });
    expect(Object.fromEntries(stats.followUp.map((w) => [w.id, w.purchases]))).toEqual({ lou: 2, sam: 1 });
  });

  it('migration 063 absente : « à appliquer », le reste des chiffres est là', () => {
    const stats = computeFieldStats({ ...input, scanOrders: null }, NOW);
    expect(stats.fromScan).toBeNull();
    expect(stats.paidOrders).toBe(5);
    expect(stats.followUp.map((w) => w.purchases)).toEqual([0, 0]);
  });

  it('lecture : commandes payées avec une origine ; colonne absente → null ; autre erreur → la page échoue', async () => {
    const origins = (error: Result['error']) => (table: string, calls: Call[]): Result => {
      const select = String(calls.find((c) => c.method === 'select')?.args[0] ?? '');
      if (table === 'orders' && select.includes('from_member_id')) {
        return error ? { data: null, error } : { data: [{ from_member_id: 'lou', created_at: daysAgo(1) }], error: null };
      }
      if (table === 'orders') return { data: [], error: null, count: 1 };
      return { data: [], error: null };
    };

    db.calls = [];
    db.respond = origins(null);
    expect((await loadFieldStats(NOW)).fromScan).toEqual({ recent: 1, total: 1 });
    const read = db.calls.find((calls) => String(calls[0]?.args[0]).includes('from_member_id'))!;
    expect(read).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'eq', args: ['status', 'paid'] }),
      expect.objectContaining({ method: 'not', args: ['from_member_id', 'is', null] }),
    ]));

    db.respond = origins({ code: '42703', message: 'column orders.from_member_id does not exist' });
    expect((await loadFieldStats(NOW)).fromScan).toBeNull();

    db.respond = origins({ code: '57014', message: 'timeout' });
    await expect(loadFieldStats(NOW)).rejects.toThrow('timeout');
  });
});
