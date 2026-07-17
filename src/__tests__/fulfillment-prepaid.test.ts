// Modèle « imprimer AU PAIEMENT » : fulfillOrder appelé SANS memberId (le profil
// n'existe pas encore). Le QR doit encoder orders.short_code (réservé au webhook),
// le fichier être stocké sous orders/<id>/, et `members` ne JAMAIS être touché.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION = {
  collected_information: {
    shipping_details: {
      name: 'Jean Dupont',
      address: { line1: '1 rue de Rivoli', line2: null, city: 'Paris', state: null, country: 'FR', postal_code: '75001' },
    },
  },
};

vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { retrieve: vi.fn().mockResolvedValue(SESSION) } };
  },
}));

vi.mock('@/lib/generate-qr-svg', () => ({
  composeBackPrintSVG: vi.fn(() => ({ svg: '<svg/>', buffer: Buffer.from('x'), width: 1, height: 1, modules: 29, taglineId: null })),
  generateBrandMonogramSVG: vi.fn(() => ({ svg: '<svg/>', buffer: Buffer.from('m'), width: 900, height: 496 })),
}));

vi.mock('@/lib/short-code', () => ({
  generateUniqueShortCode: vi.fn().mockResolvedValue('gen9'),
  buildShortUrl: (code: string) => `https://app.test/r/${code}`,
}));

// Spies partagés pour inspecter ce qui est écrit.
const uploadSpy = vi.fn(() => Promise.resolve({ error: null }));
const membersFrom = vi.fn();
const ordersUpdate = vi.fn(() => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }));

let currentOrder: Record<string, unknown>;

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: currentOrder, error: null }) }) }),
          update: ordersUpdate,
        };
      }
      if (table === 'members') {
        membersFrom(table);
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    }),
    storage: {
      from: () => ({
        upload:       uploadSpy,
        getPublicUrl: () => ({ data: { publicUrl: 'https://store.test/qr.svg' } }),
      }),
    },
  },
}));

import { fulfillOrder, orderQrStoragePath } from '@/lib/fulfillment';
import { composeBackPrintSVG } from '@/lib/generate-qr-svg';
import { generateUniqueShortCode } from '@/lib/short-code';

describe('fulfillOrder — impression au paiement (sans membre)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test');
    vi.stubEnv('PRINTFUL_VARIANT_ID_DARK', '123');
    vi.stubEnv('PRINTFUL_API_TOKEN', 'pf_token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: { id: 'pf_prepaid' } }),
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('encode orders.short_code, stocke sous orders/<id>/, et ne touche PAS members', async () => {
    currentOrder = { id: 'o1', stripe_session_id: 'sess_1', printful_order_id: null, status: 'paid', qr_style: 'rounded', tagline_id: null, short_code: 'k3f' };

    const res = await fulfillOrder({ orderId: 'o1', tshirtColor: 'dark', tshirtSize: 'M' });

    expect(res.ok).toBe(true);
    expect(res.printfulOrderId).toBe('pf_prepaid');

    // Le QR encode le short_code RÉSERVÉ de la commande.
    expect(composeBackPrintSVG).toHaveBeenCalledWith(
      'https://app.test/r/k3f', 'dark', { moduleCorner: 0.25, taglineId: null },
    );
    // Pas de génération : le code était déjà réservé.
    expect(generateUniqueShortCode).not.toHaveBeenCalled();
    // Fichier stocké sous le préfixe commande (pas <memberId>/).
    expect(uploadSpy).toHaveBeenCalledWith(
      orderQrStoragePath('o1', 'dark'), expect.anything(), expect.anything(),
    );
    // `members` n'est jamais lu/écrit (le membre n'existe pas encore).
    expect(membersFrom).not.toHaveBeenCalled();
  });

  it('réserve un short_code à la volée si la commande n\'en a pas', async () => {
    currentOrder = { id: 'o2', stripe_session_id: 'sess_2', printful_order_id: null, status: 'paid', qr_style: 'rounded', tagline_id: null, short_code: null };

    const res = await fulfillOrder({ orderId: 'o2', tshirtColor: 'dark', tshirtSize: 'M' });

    expect(res.ok).toBe(true);
    // Un code a été généré ET persisté sur la COMMANDE (pas sur un membre).
    expect(generateUniqueShortCode).toHaveBeenCalledTimes(1);
    expect(ordersUpdate).toHaveBeenCalledWith(expect.objectContaining({ short_code: 'gen9' }));
    expect(composeBackPrintSVG).toHaveBeenCalledWith(
      'https://app.test/r/gen9', 'dark', expect.anything(),
    );
    expect(membersFrom).not.toHaveBeenCalled();
  });
});
