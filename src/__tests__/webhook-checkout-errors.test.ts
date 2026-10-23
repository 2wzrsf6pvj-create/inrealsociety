// Webhook Stripe, paiement d'un t-shirt : une erreur de base ne doit jamais
// répondre 200. Avant, une lecture ou une mise à jour de la commande en échec
// arrêtait le traitement sans erreur : Stripe ne réessayait pas, et la commande
// payée restait « en attente », sans code ni t-shirt, sans alerte.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Requêtes PostgREST factices (cf. premium.test.ts) : chaque from() consomme le
// résultat suivant de `results` et enregistre ses méthodes.
const calls: { table: string; ops: [string, unknown[]][] }[] = [];
let results: unknown[] = [];
function chain(table: string): unknown {
  const entry = { table, ops: [] as [string, unknown[]][] };
  calls.push(entry);
  const result = results.shift() ?? { data: null, error: null };
  const proxy: unknown = new Proxy({}, {
    get: (_t, prop) => prop === 'then'
      ? (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko)
      : (...args: unknown[]) => { entry.ops.push([String(prop), args]); return proxy; },
  });
  return proxy;
}

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (table: string) => chain(table) } }));
const audit = vi.fn();
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => audit(...a) }));
const reportError = vi.fn();
vi.mock('@/lib/report-error', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('stripe', () => {
  class Stripe {
    webhooks = { constructEvent: (body: string) => JSON.parse(body) };
    static errors = { StripeError: class extends Error {} };
  }
  return { default: Stripe };
});

import { POST as webhook } from '@/app/api/webhook/stripe/route';

function paid(metadata: Record<string, string> = {}): NextRequest {
  const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {
    id: 'cs_1', mode: 'payment', metadata, customer_details: { email: 'jeanne@example.com' },
    payment_intent: 'pi_1', amount_total: 5400,
  } } };
  return {
    text:    async () => JSON.stringify(event),
    headers: new Headers({ 'stripe-signature': 'sig' }),
  } as unknown as NextRequest;
}

const ok    = (data: unknown) => ({ data, error: null });
const down  = { data: null, error: { message: 'base injoignable' } };
const PENDING = ok({ id: 'o-1', status: 'pending', activation_code: null, tagline_id: null });
const actions = () => audit.mock.calls.map((c) => (c[0] as { action: string }).action);

beforeEach(() => {
  calls.length = 0;
  results = [];
  audit.mockClear();
  reportError.mockClear();
});

describe('webhook checkout.session.completed — erreurs de base', () => {
  it('lecture de la commande en échec : 500 (Stripe réessaie), alerte, jamais « introuvable »', async () => {
    results = [down];
    expect((await webhook(paid())).status).toBe(500);
    expect(reportError).toHaveBeenCalledWith('webhook/stripe', expect.any(Error), { eventType: 'checkout.session.completed' });
    expect(actions()).toEqual(['webhook.failed']);
  });

  it('lecture de secours (metadata.orderId) en échec : 500 aussi', async () => {
    results = [ok(null), down];
    expect((await webhook(paid({ orderId: 'o-1' }))).status).toBe(500);
    expect(actions()).toEqual(['webhook.failed']);
  });

  it('mise à jour de la commande en échec : code retiré, puis 500', async () => {
    results = [PENDING, ok(null), down, ok(null)];
    expect((await webhook(paid())).status).toBe(500);
    const codeInsert = calls[1];
    const codeDelete = calls[3];
    expect(codeInsert.table).toBe('activation_codes');
    expect(codeDelete.table).toBe('activation_codes');
    expect(codeDelete.ops.map(([op]) => op)).toContain('delete');
    expect(actions()).toEqual(['webhook.failed']);
  });

  it('payé sans commande (aucune erreur) : 200, alerte « paiement reçu sans commande »', async () => {
    results = [ok(null), ok(null)];
    expect((await webhook(paid({ orderId: 'o-404' }))).status).toBe(200);
    expect(audit).toHaveBeenCalledWith({ action: 'order.payment_unmatched', metadata: { sessionId: 'cs_1' } });
  });
});
