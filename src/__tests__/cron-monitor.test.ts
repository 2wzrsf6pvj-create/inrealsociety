// Tâche de rattrapage des impressions surveillée par Sentry Crons (choix de
// Clément) : « en cours » au départ, puis « ok » si elle a tourné, « erreur »
// si elle n'a pas pu lire les commandes. Une tâche qui ne passe plus du tout
// laisse Sentry sans signal : il alerte à l'heure prévue.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const sentry = vi.hoisted(() => ({
  captureCheckIn:   vi.fn<(checkIn: { status: string }, config?: unknown) => string>(() => 'check-1'),
  captureException: vi.fn(),
  captureMessage:   vi.fn(),
}));
vi.mock('@sentry/nextjs', () => sentry);

let ordersResult: { data: unknown; error: unknown } = { data: [], error: null };
vi.mock('@/lib/supabase-admin', () => {
  const chain: unknown = new Proxy({}, {
    get: (_t, prop) => prop === 'then'
      ? (ok: (v: unknown) => unknown) => Promise.resolve(ordersResult).then(ok)
      : () => chain,
  });
  return { supabaseAdmin: { from: () => chain } };
});
const fulfillOrder = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fulfillment', () => ({ fulfillOrder }));
const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/audit', () => ({ audit }));

import { GET } from '@/app/api/cron/fulfillment-reconcile/route';
import { FULFILLMENT_MONITOR } from '@/lib/cron-monitors';

const run = () => GET(new NextRequest('http://localhost/api/cron/fulfillment-reconcile', {
  headers: { authorization: 'Bearer cron-secret-de-test' },
}));
const statuses = () => sentry.captureCheckIn.mock.calls.map((c) => c[0].status);

beforeEach(() => {
  vi.clearAllMocks();
  ordersResult = { data: [], error: null };
  vi.stubEnv('CRON_SECRET', 'cron-secret-de-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('cron fulfillment-reconcile — Sentry Crons', () => {
  it('passage normal : « en cours » avec l’horaire du moniteur, puis « ok »', async () => {
    expect((await run()).status).toBe(200);
    expect(statuses()).toEqual(['in_progress', 'ok']);
    expect(sentry.captureCheckIn.mock.calls[0]).toEqual([
      { monitorSlug: 'fulfillment-reconcile', status: 'in_progress' },
      FULFILLMENT_MONITOR.config,
    ]);
    expect(sentry.captureCheckIn.mock.calls[1][0]).toMatchObject({ checkInId: 'check-1' });
  });

  it('commandes illisibles : « erreur », et l’erreur part dans Sentry', async () => {
    ordersResult = { data: null, error: { message: 'base injoignable' } };
    expect((await run()).status).toBe(500);
    expect(statuses()).toEqual(['in_progress', 'error']);
    expect(sentry.captureException).toHaveBeenCalled();
  });

  it('exception à l’impression : alerte « argent » pour cette commande, la tâche continue', async () => {
    ordersResult = { data: [{ id: 'o-1', activation_code: null, tshirt_color: 'dark', tshirt_size: 'M', short_code: 'k7p2q' }], error: null };
    fulfillOrder.mockRejectedValueOnce(new Error('Printful injoignable'));
    expect((await run()).status).toBe(200);
    expect(audit).toHaveBeenCalledWith({
      action:   'order.fulfillment_failed',
      metadata: { orderId: 'o-1', reason: 'exception', trigger: 'cron_reconcile' },
    });
    expect(sentry.captureException).toHaveBeenCalled();
    expect(statuses()).toEqual(['in_progress', 'ok']);
  });

  it('appel non autorisé : aucun signal (ce n’est pas un passage de la tâche)', async () => {
    vi.stubEnv('CRON_SECRET', 'autre');
    expect((await run()).status).toBe(403);
    expect(sentry.captureCheckIn).not.toHaveBeenCalled();
  });
});
