// Avant J0 (choix de Clément) :
// - les QR imprimés encodent inreal.me/<code> (portée ≈ 2,5 m) : le domaine
//   court mène au profil comme <site>/r/<code> ; avant, rien ne le routait et
//   chaque QR imprimé aurait mené à une page introuvable ;
// - premium offert aux testeurs depuis /admin, 4 semaines, tracé : il s'arrête
//   seul à sa date, sans Stripe, et ne touche jamais un abonné payant.

import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Visiteur non connecté, pour le proxy.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

// Base simulée : chaque requête note ses appels ; mises à jour et insertions
// sont gardées.
type Call = { method: string; args: unknown[] };
const db = vi.hoisted(() => ({
  member:     null as Record<string, unknown> | null,
  /** Lignes renvoyées par une mise à jour (celles que ses filtres retiennent). */
  updateRows: [] as { id: string }[],
  updates:    [] as { table: string; calls: Call[] }[],
  inserted:   [] as { table: string; row: Record<string, unknown> }[],
}));
vi.mock('@/lib/supabase-admin', () => {
  function respond(table: string, calls: Call[]) {
    const first = calls[0]?.method;
    if (first === 'insert') {
      db.inserted.push({ table, row: calls[0].args[0] as Record<string, unknown> });
      return { error: null };
    }
    if (first === 'update') {
      db.updates.push({ table, calls });
      return { data: db.updateRows, error: null };
    }
    return { data: table === 'members' ? db.member : null, error: null };
  }
  function query(table: string) {
    const calls: Call[] = [];
    const q: object = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
            Promise.resolve(respond(table, calls)).then(ok, ko);
        }
        return (...args: unknown[]) => { calls.push({ method: String(prop), args }); return q; };
      },
    });
    return q;
  }
  return { supabaseAdmin: { from: (table: string) => query(table) } };
});
const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/audit', () => ({ audit }));
let currentUser: Record<string, unknown> | null = null;
vi.mock('@/lib/require-auth', () => ({
  requireAuth: async () => currentUser ? { user: currentUser } : NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }),
  isHttpError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/ratelimit', () => ({
  checkAuthRateLimit: async () => ({ success: true }),
  rateLimitHeaders:   () => ({}),
}));
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: vi.fn(async () => true),
}));

import { POST as moderation } from '@/app/api/admin/moderation/route';
import { GET as reconcile } from '@/app/api/cron/premium-reconcile/route';
import { endExpiredGifts } from '@/lib/premium';
import { isGiftedPremium, premiumState, PREMIUM_GIFT_DAYS } from '@/lib/subscription';
import { computeFieldStats } from '@/lib/field-stats';
import { sendEmail } from '@/lib/email-templates';

// ─── Domaine court ──────────────────────────────────────────────────────────

/** Proxy chargé avec ces variables (lues au chargement du module). */
async function loadProxy(env: Record<string, string>) {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inrealsociety.com');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import('@/proxy')).proxy;
}
const visit = (proxy: (req: NextRequest) => Promise<Response>, url: string) =>
  proxy(new NextRequest(url, { headers: { host: new URL(url).host } }));
afterAll(() => { vi.unstubAllEnvs(); });

describe('domaine court des QR imprimés', () => {
  it('inreal.me/<code> : réécrit vers /r/<code>, un seul aller-retour jusqu’au profil', async () => {
    const proxy = await loadProxy({ SHORT_DOMAIN: 'https://inreal.me' });
    expect((await visit(proxy, 'https://inreal.me/k7p2q')).headers.get('x-middleware-rewrite')).toBe('https://inreal.me/r/k7p2q');
    // Un appareil photo qui passerait l'adresse en majuscules.
    expect((await visit(proxy, 'https://inreal.me/K7P2Q')).headers.get('x-middleware-rewrite')).toBe('https://inreal.me/r/k7p2q');
  });

  it('le reste du domaine court : le site principal, chemin et paramètres gardés', async () => {
    const proxy = await loadProxy({ SHORT_DOMAIN: 'https://inreal.me/' });
    expect((await visit(proxy, 'https://inreal.me/')).headers.get('location')).toBe('https://inrealsociety.com/');
    expect((await visit(proxy, 'https://inreal.me/?error=qr_invalid')).headers.get('location'))
      .toBe('https://inrealsociety.com/?error=qr_invalid');
    expect((await visit(proxy, 'https://inreal.me/profil/abc')).headers.get('location')).toBe('https://inrealsociety.com/profil/abc');
    expect((await visit(proxy, 'https://inreal.me/codetroplong')).headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('le domaine principal n’est pas touché', async () => {
    const proxy = await loadProxy({ SHORT_DOMAIN: 'https://inreal.me' });
    const res = await visit(proxy, 'https://inrealsociety.com/r/k7p2q');
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('location')).toBeNull();
  });

  it('sans SHORT_DOMAIN : rien ne change', async () => {
    const proxy = await loadProxy({});
    expect((await visit(proxy, 'https://inreal.me/k7p2q')).headers.get('x-middleware-rewrite')).toBeNull();
  });
});

// ─── Premium offert ─────────────────────────────────────────────────────────

const MEMBER = '11111111-1111-4111-8111-111111111111';
const ADMIN  = { id: 'auth-admin', email: 'Clement@Example.com', email_confirmed_at: '2026-10-01T00:00:00Z' };
const DAY = 86_400_000;
const FREE   = { id: MEMBER, name: 'Lou', email: 'lou@example.com', plan: 'free', stripe_subscription_id: null, plan_expires_at: null };
const GIFTED = { ...FREE, plan: 'premium', plan_expires_at: '2026-11-21T14:00:00.000Z' };
const PAID   = { ...FREE, plan: 'premium', stripe_subscription_id: 'sub_A1' };

const post = (body: unknown) =>
  moderation(new NextRequest('http://localhost:3000/api/admin/moderation', {
    method: 'POST', body: JSON.stringify(body), headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
  }));
/** Filtres d'une requête : [méthode, colonne, valeur]. */
const filters = (calls: Call[]) => calls.filter((c) => ['eq', 'is', 'lte'].includes(c.method)).map((c) => [c.method, ...c.args]);

describe('premium offert depuis /admin', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', 'clement@example.com');
    currentUser = ADMIN;
    db.member = { ...FREE };
    db.updateRows = [{ id: MEMBER }];
    db.updates.length = 0;
    db.inserted.length = 0;
    audit.mockClear();
    vi.mocked(sendEmail).mockClear();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it(`offert ${PREMIUM_GIFT_DAYS / 7} semaines à un porteur gratuit, tracé, sans email`, async () => {
    const before = Date.now();
    const res = await post({ action: 'gift_premium', memberId: MEMBER });
    expect(res.status).toBe(200);
    const body = await res.json();

    const [update] = db.updates;
    const values = update.calls[0].args[0] as { plan: string; plan_expires_at: string };
    expect(values.plan).toBe('premium');
    const until = Date.parse(values.plan_expires_at);
    expect(until).toBeGreaterThanOrEqual(before + 28 * DAY);
    expect(until).toBeLessThanOrEqual(Date.now() + 28 * DAY);
    // Seulement s'il est toujours gratuit, sans abonnement : un abonnement pris
    // entre-temps n'est pas écrasé.
    expect(filters(update.calls)).toEqual([['eq', 'id', MEMBER], ['eq', 'plan', 'free'], ['is', 'stripe_subscription_id', null]]);

    expect(db.inserted).toEqual([{ table: 'audit_logs', row: {
      action: 'member.premium_gifted', member_id: MEMBER, metadata: { by: 'clement@example.com', until: values.plan_expires_at },
    } }]);
    expect(body).toEqual({ ok: true, memberNotified: null, reporterNotified: null, premiumUntil: values.plan_expires_at });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('jamais à un abonné payant, ni deux fois', async () => {
    db.member = { ...PAID };
    const paid = await post({ action: 'gift_premium', memberId: MEMBER });
    expect(paid.status).toBe(409);
    expect((await paid.json()).error).toBe('Abonné : il paie son premium.');

    db.member = { ...GIFTED };
    const twice = await post({ action: 'gift_premium', memberId: MEMBER });
    expect(twice.status).toBe(409);
    expect((await twice.json()).error).toBe('Premium déjà offert jusqu’au 21 novembre 2026.');

    expect(db.updates).toEqual([]);
    expect(db.inserted).toEqual([]);
  });

  it('passé premium entre la lecture et l’écriture : rien d’offert, rien de tracé', async () => {
    db.updateRows = [];
    const res = await post({ action: 'gift_premium', memberId: MEMBER });
    expect(res.status).toBe(409);
    expect(db.inserted).toEqual([]);
  });

  it('porteur introuvable : 404', async () => {
    db.member = null;
    expect((await post({ action: 'gift_premium', memberId: MEMBER })).status).toBe(404);
  });

  it('arrêté avant sa date : retour au gratuit, tracé', async () => {
    db.member = { ...GIFTED };
    const res = await post({ action: 'end_gift_premium', memberId: MEMBER });
    expect(res.status).toBe(200);
    const [update] = db.updates;
    expect(update.calls[0].args[0]).toEqual({ plan: 'free', plan_expires_at: null });
    expect(filters(update.calls)).toEqual([['eq', 'id', MEMBER], ['eq', 'plan', 'premium'], ['is', 'stripe_subscription_id', null]]);
    expect(db.inserted.map((i) => i.row)).toEqual([
      { action: 'member.premium_gift_ended', member_id: MEMBER, metadata: { by: 'clement@example.com' } },
    ]);
  });

  it('« arrêter » ne touche ni un abonné payant, ni un porteur gratuit', async () => {
    db.member = { ...PAID };
    expect((await post({ action: 'end_gift_premium', memberId: MEMBER })).status).toBe(409);
    db.member = { ...FREE };
    expect((await post({ action: 'end_gift_premium', memberId: MEMBER })).status).toBe(409);
    expect(db.updates).toEqual([]);
  });

  it('réservé à l’équipe : 404 pour tout autre compte', async () => {
    currentUser = { ...ADMIN, email: 'intrus@example.com' };
    expect((await post({ action: 'gift_premium', memberId: MEMBER })).status).toBe(404);
    expect(db.updates).toEqual([]);
  });
});

describe('fin du premium offert à sa date', () => {
  beforeEach(() => {
    db.updateRows = [{ id: 'm1' }, { id: 'm2' }];
    db.updates.length = 0;
    audit.mockClear();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('premium sans abonnement, date passée : gratuit, tracé pour chacun', async () => {
    const now = new Date('2026-11-22T04:00:00.000Z');
    expect(await endExpiredGifts(now)).toBe(2);
    const [update] = db.updates;
    expect(update.calls[0].args[0]).toEqual({ plan: 'free', plan_expires_at: null });
    expect(filters(update.calls)).toEqual([
      ['eq', 'plan', 'premium'], ['is', 'stripe_subscription_id', null], ['lte', 'plan_expires_at', now.toISOString()],
    ]);
    expect(audit.mock.calls.map((c) => c[0])).toEqual([
      { action: 'member.premium_gift_ended', memberId: 'm1', metadata: { reason: 'date' } },
      { action: 'member.premium_gift_ended', memberId: 'm2', metadata: { reason: 'date' } },
    ]);
  });

  it('la tâche quotidienne l’applique, même sans Stripe configuré', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-cron');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const res = await reconcile(new NextRequest('http://localhost:3000/api/cron/premium-reconcile', {
      headers: { authorization: 'Bearer secret-cron' },
    }));
    expect(res.status).toBe(500);   // Stripe manquant reste signalé
    expect(await res.json()).toEqual(expect.objectContaining({ giftsEnded: 2 }));
    expect(db.updates).toHaveLength(1);
  });
});

describe('premium payé ou offert', () => {
  it('offert : premium sans abonnement Stripe', () => {
    expect(isGiftedPremium(GIFTED)).toBe(true);
    expect(isGiftedPremium(PAID)).toBe(false);
    expect(isGiftedPremium(FREE)).toBe(false);
    expect(premiumState(GIFTED)).toEqual({ gift: true, until: '2026-11-21T14:00:00.000Z' });
    expect(premiumState({ ...PAID, plan_expires_at: '2026-12-01T00:00:00.000Z' })).toEqual({ gift: false, until: '2026-12-01T00:00:00.000Z' });
    expect(premiumState(FREE)).toBeNull();
  });

  it('/admin : les testeurs ne comptent pas comme abonnés, et leur date de fin se voit', () => {
    const NOW = new Date('2026-10-24T12:00:00Z');
    const row = (id: string, over: Record<string, unknown>) => ({
      id, created_at: '2026-10-24T09:00:00Z', plan: 'free', name: id, short_code: null, is_paused: false, suspended_at: null,
      stripe_subscription_id: null as string | null, plan_expires_at: null as string | null, ...over,
    });
    const stats = computeFieldStats({
      members: [
        row('paye', { plan: 'premium', stripe_subscription_id: 'sub_1' }),
        row('testeur', { plan: 'premium', plan_expires_at: '2026-11-21T09:00:00Z' }),
        row('gratuit', {}),
      ],
      scans: [], roots: [], replyParents: [], paidOrders: 0, subscriptions: [], phones: null,
    }, NOW);
    expect(stats).toEqual(expect.objectContaining({ premium: 1, giftedPremium: 1 }));
    expect(Object.fromEntries(stats.followUp.map((w) => [w.id, w.premium]))).toEqual({
      paye: { gift: false, until: null }, testeur: { gift: true, until: '2026-11-21T09:00:00Z' }, gratuit: null,
    });
  });
});
