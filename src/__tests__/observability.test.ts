// Observabilité (choix de Clément, 2026-10-23) :
// - toute erreur rattrapée (route en 500, tâche) part dans Sentry : avant, 28
//   routes sur 38 ne laissaient qu'un log Vercel, gardé une heure à un jour ;
// - les échecs qui touchent l'argent : Sentry (tag alerte=argent) ET email à
//   ADMIN_ALERT_EMAIL, à chaque occurrence ;
// - l'écriture d'audit passe par waitUntil (Vercel peut figer la fonction dès
//   la réponse) ;
// - la tâche d'impression est surveillée par Sentry Crons, à l'horaire de
//   vercel.json ; la page de santé vérifie aussi Upstash.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

const inserted: Record<string, unknown>[] = [];
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: Record<string, unknown>) => { inserted.push(row); return Promise.resolve({ error: null }); },
      select: () => ({ limit: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: async (mail: { to: string; subject: string; html: string }) => { sent.push(mail); return true; },
}));
const redisUp = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/ratelimit', () => ({ pingRedis: async () => redisUp.value }));
vi.mock('@/lib/supabase-config', () => ({ SUPABASE_CONFIGURED: true }));

import { reportError } from '@/lib/report-error';
import { waitUntil } from '@/lib/wait-until';
import { audit, MONEY_ALERTS } from '@/lib/audit';
import { FULFILLMENT_MONITOR } from '@/lib/cron-monitors';
import { GET as health } from '@/app/api/health/route';

const ROOT = path.resolve(__dirname, '../..');
const CONTEXT = Symbol.for('@vercel/request-context');
const handedOver: Promise<unknown>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  sent.length = 0;
  handedOver.length = 0;
  redisUp.value = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Contexte de requête Vercel factice : ce que le runtime dépose sur globalThis.
  (globalThis as Record<symbol, unknown>)[CONTEXT] = { get: () => ({ waitUntil: (p: Promise<unknown>) => handedOver.push(p) }) };
});
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTEXT];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('reportError', () => {
  it('log + Sentry, avec la route en tag', () => {
    const err = new Error('boom');
    reportError('api/scan', err, { memberId: 'm-1' });
    expect(console.error).toHaveBeenCalledWith('[api/scan]', err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { scope: 'api/scan' }, extra: { memberId: 'm-1' } });
  });

  it('erreur PostgREST (pas une Error) : code et message, jamais `details`', () => {
    reportError('api/member/update', { code: '23505', message: 'duplicate key', details: 'Key (email)=(a@b.fr) already exists' });
    const [err] = sentry.captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('23505 duplicate key');
  });
});

describe('waitUntil', () => {
  it('confie la tâche au contexte Vercel quand il existe', () => {
    const p = Promise.resolve();
    waitUntil(p);
    expect(handedOver).toEqual([p]);
  });

  it('hors Vercel : sans effet, sans erreur', () => {
    delete (globalThis as Record<symbol, unknown>)[CONTEXT];
    expect(() => waitUntil(Promise.resolve())).not.toThrow();
  });
});

describe('audit — alertes « argent »', () => {
  it.each(Object.keys(MONEY_ALERTS))('%s : Sentry (tag alerte=argent) ET email à ADMIN_ALERT_EMAIL', async (action) => {
    vi.stubEnv('ADMIN_ALERT_EMAIL', 'alertes@inrealsociety.com');
    audit({ action: action as never, metadata: { orderId: 'o-1', email: 'jeanne@example.com', ip: '1.2.3.4' } });
    await Promise.all(handedOver);

    const [message, options] = sentry.captureMessage.mock.calls[0];
    expect(message).toBe(`audit: ${action}`);
    expect(options.tags).toEqual({ alerte: 'argent' });
    expect(options.extra).toEqual({ memberId: undefined, orderId: 'o-1' });   // ni email ni IP vers Sentry

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('alertes@inrealsociety.com');
    expect(sent[0].subject).toBe(`Alerte : ${MONEY_ALERTS[action as keyof typeof MONEY_ALERTS]!.title}`);
    expect(sent[0].html).toContain('jeanne@example.com');   // première partie : utile pour agir
    expect(sent[0].html).not.toContain('1.2.3.4');
  });

  it('chaque occurrence alerte, pas seulement la première', async () => {
    vi.stubEnv('ADMIN_ALERT_EMAIL', 'alertes@inrealsociety.com');
    audit({ action: 'order.fulfillment_failed', metadata: { orderId: 'o-1' } });
    audit({ action: 'order.fulfillment_failed', metadata: { orderId: 'o-2' } });
    await Promise.all(handedOver);
    expect(sent).toHaveLength(2);
  });

  it('autre échec (message.report_failed) : Sentry sans tag, pas d’email', () => {
    vi.stubEnv('ADMIN_ALERT_EMAIL', 'alertes@inrealsociety.com');
    audit({ action: 'message.report_failed' });
    expect(sentry.captureMessage.mock.calls[0][1].tags).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('action ordinaire : ni Sentry ni email, seulement le journal', async () => {
    audit({ action: 'scan.recorded', memberId: 'm-1' });
    await Promise.all(handedOver);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(inserted).toEqual([{ action: 'scan.recorded', member_id: 'm-1', ip: null, metadata: null }]);
  });

  it('écriture du journal confiée à waitUntil : elle va au bout même après la réponse', () => {
    audit({ action: 'scan.recorded' });
    expect(handedOver).toHaveLength(1);
  });

  it('sans ADMIN_ALERT_EMAIL : Sentry seulement, signalé dans les logs', () => {
    audit({ action: 'order.payment_unmatched', metadata: { sessionId: 'cs_1' } });
    expect(sentry.captureMessage).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_ALERT_EMAIL absent'));
  });
});

describe('les erreurs rattrapées atteignent Sentry', () => {
  const routes = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? routes(full) : e.name === 'route.ts' ? [full] : [];
  });

  it('toute route qui répond 500 appelle reportError', () => {
    const silent = routes(path.join(ROOT, 'src/app/api'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes('status: 500'))
      .filter((f) => !fs.readFileSync(f, 'utf8').includes('reportError('))
      .map((f) => path.relative(ROOT, f));
    expect(silent).toEqual([]);
  });
});

describe('Sentry Crons', () => {
  it('le moniteur de la tâche d’impression suit l’horaire de vercel.json', () => {
    const { crons } = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] };
    const cron = crons.find((c) => c.path === `/api/cron/${FULFILLMENT_MONITOR.slug}`);
    expect(cron?.schedule).toBe(FULFILLMENT_MONITOR.config.schedule.value);
  });
});

describe('/api/health — Upstash', () => {
  it('Upstash répond : 200', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://u.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
    const res = await health();
    expect(res.status).toBe(200);
    expect((await res.json()).checks).toMatchObject({ supabase: 'ok', upstash: 'ok' });
  });

  it('Upstash ne répond pas : 503 (scanner un QR répondrait 500)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://u.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
    redisUp.value = false;
    expect((await health()).status).toBe(503);
  });

  it('Upstash absent en production : 503 ; en local : ignoré', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await health()).status).toBe(503);
    vi.stubEnv('VERCEL_ENV', '');
    expect((await health()).status).toBe(200);
  });
});
