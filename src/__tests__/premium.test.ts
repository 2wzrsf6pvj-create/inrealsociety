// Transitions du premium (lib/premium) : chacune est réservée en base et son email
// part une fois, quel que soit l'ordre des événements Stripe. Une écriture en
// échec est levée : le webhook répond 500 et Stripe réessaie (avant : 200, et un
// porteur qui avait payé pouvait rester en gratuit).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Requêtes PostgREST factices : chaque appel à from() consomme le résultat suivant
// de `results` et enregistre ses méthodes (filtres compris).
const calls: { table: string; ops: [string, unknown[]][] }[] = [];
let results: unknown[] = [];
function chain(table: string): unknown {
  const entry = { table, ops: [] as [string, unknown[]][] };
  calls.push(entry);
  const result = results.shift() ?? { data: [], error: null };
  const proxy: unknown = new Proxy({}, {
    get: (_t, prop) => prop === 'then'
      ? (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko)
      : (...args: unknown[]) => { entry.ops.push([String(prop), args]); return proxy; },
  });
  return proxy;
}

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (table: string) => chain(table) } }));
const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: async (mail: { to: string; subject: string; html: string }) => { sent.push(mail); return true; },
}));
const audit = vi.fn();
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock('@/lib/printful-status', () => ({ cancelPrintfulOrder: vi.fn() }));
vi.mock('stripe', () => {
  class Stripe {
    webhooks = { constructEvent: (body: string) => JSON.parse(body) };
    static errors = { StripeError: class extends Error {} };
  }
  return { default: Stripe };
});

import { activatePremium, applyScheduledEnd, endPremium } from '@/lib/premium';
import { POST as webhook } from '@/app/api/webhook/stripe/route';

const MEMBER = { id: 'm-1', name: 'Camille', email: 'camille@example.com' };
const ok = (data: unknown) => ({ data, error: null });
const ops = (i: number) => calls[i].ops;

beforeEach(() => {
  audit.mockClear();
  calls.length = 0;
  sent.length = 0;
  results = [];
});

describe('activatePremium', () => {
  const args = { memberId: 'm-1', customerId: 'cus_A1', subscriptionId: 'sub_A1' };

  const free = ok({ plan: 'free', stripe_subscription_id: null });

  it('première activation : premium posé, email de bienvenue qui confirme le contrat', async () => {
    results = [free, ok([{ name: 'Camille', email: 'camille@example.com' }])];
    expect(await activatePremium(args)).toBe(true);

    // Verrou optimiste : l'écriture n'a lieu que si le membre est toujours dans
    // l'état lu (gratuit, sans abonnement).
    expect(ops(1)).toContainEqual(['eq', ['plan', 'free']]);
    expect(ops(1)).toContainEqual(['is', ['stripe_subscription_id', null]]);
    expect(sent).toHaveLength(1);
    const { subject, html } = sent[0];
    expect(subject).toContain('bienvenue dans le cercle premium');
    expect(html).toContain('2,99');
    expect(html).toContain('2,99\u00A0€ par mois'); // franchise de TVA : sans « TTC »
    expect(html).not.toContain('TTC');
    expect(html).toContain('Résiliable à tout moment');
    expect(html).toContain('14 jours pour vous rétracter');
    expect(html).toContain('remboursé en entier');
    expect(html).toContain('Formulaire de rétractation');
    expect(html).toContain('Vos scans des 7 derniers jours');
  });

  it('déjà premium sur cet abonnement (rejeu, ou autre événement arrivé avant) : pas de second email', async () => {
    results = [ok({ plan: 'premium', stripe_subscription_id: 'sub_A1' })];
    expect(await activatePremium(args)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('déjà premium sur un autre abonnement (double paiement) : bascule sans email, signalée', async () => {
    results = [ok({ plan: 'premium', stripe_subscription_id: 'sub_OLD1' }), ok([{ name: 'Camille', email: 'camille@example.com' }])];
    expect(await activatePremium(args)).toBe(true);
    expect(ops(1)).toContainEqual(['eq', ['stripe_subscription_id', 'sub_OLD1']]);
    expect(sent).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'subscription.duplicate' }));
  });

  it('événement simultané passé entre la lecture et l\'écriture : rien, l\'autre a envoyé', async () => {
    results = [free, ok([])];
    expect(await activatePremium(args)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('écriture en échec : levée (le webhook répondra 500), aucun email', async () => {
    results = [free, { data: null, error: { message: 'connexion perdue' } }];
    await expect(activatePremium(args)).rejects.toThrow(/activation impossible/);
    expect(sent).toHaveLength(0);
  });

  it('lecture en échec : levée aussi', async () => {
    results = [{ data: null, error: { message: 'connexion perdue' } }];
    await expect(activatePremium(args)).rejects.toThrow(/lecture du membre impossible/);
  });

  it('identifiant Stripe inattendu : refusé avant toute requête', async () => {
    await expect(activatePremium({ ...args, subscriptionId: 'sub_A1,plan.eq.free' })).rejects.toThrow(/inattendu/);
    expect(calls).toHaveLength(0);
  });
});

describe('applyScheduledEnd (résiliation programmée)', () => {
  it('première fois : date posée et confirmation par email avec la date de fin', async () => {
    results = [ok([{ id: 'm-1' }])];
    await applyScheduledEnd(MEMBER, '2026-11-22T10:00:00.000Z');
    expect(ops(0)).toContainEqual(['update', [{ plan_expires_at: '2026-11-22T10:00:00.000Z' }]]);
    expect(ops(0)).toContainEqual(['is', ['plan_expires_at', null]]);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('votre résiliation est enregistrée');
    const text = sent[0].html.replace(/\s+/g, ' ');
    expect(text).toContain('Il reste actif jusqu’au 22 novembre 2026');
    expect(text).toContain('aucun autre prélèvement');
  });

  it('déjà programmée : la date est mise à jour, pas de second email', async () => {
    results = [ok([]), ok(null)];
    await applyScheduledEnd(MEMBER, '2026-11-22T10:00:00.000Z');
    expect(calls).toHaveLength(2);
    expect(ops(1)).toContainEqual(['update', [{ plan_expires_at: '2026-11-22T10:00:00.000Z' }]]);
    expect(sent).toHaveLength(0);
  });

  it('résiliation annulée depuis le portail : la date est effacée, sans email', async () => {
    results = [ok(null)];
    await applyScheduledEnd(MEMBER, null);
    expect(ops(0)).toContainEqual(['update', [{ plan_expires_at: null }]]);
    expect(sent).toHaveLength(0);
  });
});

describe('endPremium', () => {
  const update = { plan: 'free' as const, stripe_subscription_id: null, plan_expires_at: null };

  it('premium → gratuit : email de fin, une fois', async () => {
    results = [ok([{ name: 'Camille', email: 'camille@example.com' }])];
    expect(await endPremium('m-1', update, { endedAt: new Date('2026-11-22T10:00:00Z'), reason: 'canceled' })).toBe(true);
    expect(ops(0)).toContainEqual(['eq', ['plan', 'premium']]);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('a pris fin');
    expect(sent[0].html).toContain('22 novembre 2026');
  });

  it('déjà gratuit : alignement sans email', async () => {
    results = [ok([]), ok(null)];
    expect(await endPremium('m-1', update, { endedAt: new Date(), reason: 'canceled' })).toBe(false);
    expect(calls).toHaveLength(2);
    expect(sent).toHaveLength(0);
  });
});

describe('webhook : abonnement souscrit', () => {
  const completed = () => ({
    text:    async () => JSON.stringify({ type: 'checkout.session.completed', data: { object: {
      id: 'cs_1', mode: 'subscription', subscription: 'sub_A1', customer: 'cus_A1', metadata: { memberId: 'm-1' },
    } } }),
    headers: new Headers({ 'stripe-signature': 'sig' }),
  } as unknown as NextRequest);

  it('écriture en base en échec : 500, pour que Stripe réessaie', async () => {
    results = [ok({ plan: 'free', stripe_subscription_id: null }), { data: null, error: { message: 'connexion perdue' } }];
    expect((await webhook(completed())).status).toBe(500);
    expect(sent).toHaveLength(0);
  });

  it('rejeu après succès : 200, pas de second email', async () => {
    results = [ok({ plan: 'premium', stripe_subscription_id: 'sub_A1' })];
    expect((await webhook(completed())).status).toBe(200);
    expect(sent).toHaveLength(0);
  });
});
