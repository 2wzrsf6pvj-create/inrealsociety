// Tests d'idempotence pour fulfillOrder.
//
// Scope volontairement limité : on vérifie les chemins de bail-out précoce
// (idempotence), pas le happy path complet (qui nécessite mocker Stripe,
// generatePremiumQRCode, Printful API, et 5 calls Supabase chaînés). Ces
// tests-là valent mieux en intégration sur une vraie DB de test.
//
// Ce qu'on couvre ici, ce sont les invariants critiques business :
//   1. Order introuvable → bail-out propre, aucune API externe touchée
//   2. Order non payé → idem
//   3. Order déjà fulfilled (printful_order_id set) → alreadyFulfilled=true,
//      AUCUN appel Printful (idempotence)

import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeFromMock(orderData: unknown, orderError: unknown = null) {
  return vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: orderData, error: orderError }),
      })),
    })),
  }));
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('stripe', () => ({
  default: vi.fn(),
}));

import { fulfillOrder } from '@/lib/fulfillment';
import { supabaseAdmin } from '@/lib/supabase-admin';

describe('fulfillOrder — idempotence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('retourne order_not_found si l\'order n\'existe pas', async () => {
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(
      makeFromMock(null, null),
    );

    const result = await fulfillOrder({ orderId: 'missing', memberId: 'm1', tshirtColor: 'dark', tshirtSize: 'M' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('order_not_found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retourne order_not_paid si status != paid', async () => {
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(
      makeFromMock({ id: 'o1', stripe_session_id: 'sess', printful_order_id: null, status: 'pending' }),
    );

    const result = await fulfillOrder({ orderId: 'o1', memberId: 'm1', tshirtColor: 'dark', tshirtSize: 'M' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('order_not_paid');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retourne alreadyFulfilled=true sans appeler Printful si printful_order_id est déjà set', async () => {
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(
      makeFromMock({
        id:                'o1',
        stripe_session_id: 'sess_123',
        printful_order_id: 'printful_existing_id',
        status:            'paid',
      }),
    );

    const result = await fulfillOrder({ orderId: 'o1', memberId: 'm1', tshirtColor: 'dark', tshirtSize: 'M' });
    expect(result.ok).toBe(true);
    expect(result.alreadyFulfilled).toBe(true);
    expect(result.printfulOrderId).toBe('printful_existing_id');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
