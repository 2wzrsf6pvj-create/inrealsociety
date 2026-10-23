// Sessions de paiement Stripe : ce que le client choisit doit être ce qui est
// livré et facturé. L'option express (12 €) partait chez Printful en livraison
// standard ; en franchise de TVA, Stripe ne calcule aucune TVA et n'a pas besoin
// d'adresse de facturation ; seuls les pays prévus sont proposés.

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

type SessionParams = {
  automatic_tax?: unknown;
  billing_address_collection?: unknown;
  customer_update?: unknown;
  shipping_address_collection?: { allowed_countries: string[] };
  shipping_options?: Array<{ shipping_rate_data: Record<string, unknown> }>;
};
const createSession = vi.fn<(params: SessionParams) => Promise<{ id: string; url: string }>>(
  async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/cs_test_1' }),
);

vi.mock('stripe', () => {
  class StripeError extends Error {}
  return {
    default: class {
      static errors = { StripeError };
      checkout = { sessions: { create: createSession } };
      subscriptions = { list: async () => ({ data: [] }) };
    },
  };
});
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: async () => ({ success: true }),
  checkAuthRateLimit:   async () => ({ success: true }),
  getIp:                () => '203.0.113.7',
  rateLimitHeaders:     () => ({}),
}));
vi.mock('@/lib/require-auth', () => ({
  getOptionalUser: async () => null,
  requireAuth:     async () => ({ user: { id: 'auth-1', email: 'alex@example.com' } }),
  isHttpError:     () => false,
}));
vi.mock('@/lib/referral', () => ({ resolveReferrer: async () => null }));
vi.mock('@/lib/report-error', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/premium', () => ({ activatePremium: vi.fn() }));
// Boutique : la commande est créée. Premium : membre gratuit, déjà client Stripe.
vi.mock('@/lib/supabase-admin', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    insert: () => chain,
    select: () => chain,
    update: () => chain,
    eq:     () => chain,
    single: async () => ({
      data:  { id: 'row-1', email: 'alex@example.com', stripe_customer_id: 'cus_1', plan: 'free' },
      error: null,
    }),
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  });
  return { supabaseAdmin: { from: () => chain } };
});

beforeAll(() => {
  vi.stubEnv('STRIPE_PRICE_ID', 'price_tee');   // lu au chargement de la route
  vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_premium');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inrealsociety.test');
});
afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => { createSession.mockClear(); });

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method: 'POST', body: JSON.stringify(body) });

async function shopSession(): Promise<SessionParams> {
  const { POST } = await import('@/app/api/shop/checkout/route');
  const res = await POST(post('/api/shop/checkout', { email: 'jeanne@example.com', tshirtColor: 'dark', tshirtSize: 'M' }));
  expect(res.status).toBe(200);
  return createSession.mock.calls[0][0];
}

describe('session de paiement du t-shirt', () => {
  it('une seule livraison : la standard à 5 €, celle que Printful expédie', async () => {
    const { shipping_options } = await shopSession();
    expect(shipping_options).toHaveLength(1);
    expect(shipping_options?.[0].shipping_rate_data).toMatchObject({
      display_name: 'Livraison standard',
      fixed_amount: { amount: 500, currency: 'eur' },
    });
  });

  it('livrée en France, Belgique, Luxembourg et Allemagne seulement', async () => {
    const { shipping_address_collection } = await shopSession();
    expect(shipping_address_collection?.allowed_countries).toEqual(['FR', 'BE', 'LU', 'DE']);
  });

  it('franchise de TVA : Stripe ne calcule aucune TVA', async () => {
    expect(await shopSession()).not.toHaveProperty('automatic_tax');
  });
});

describe('session de paiement du premium', () => {
  it('franchise de TVA : ni TVA ni adresse de facturation demandées', async () => {
    const { POST } = await import('@/app/api/subscription/checkout/route');
    const res = await POST(post('/api/subscription/checkout', { acceptedTerms: true }));
    expect(res.status).toBe(200);
    const params = createSession.mock.calls[0][0];
    expect(params).not.toHaveProperty('automatic_tax');
    expect(params).not.toHaveProperty('billing_address_collection');
    expect(params).not.toHaveProperty('customer_update');
  });
});
