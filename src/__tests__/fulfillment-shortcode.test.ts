// Régression H3 : si le membre n'a pas de short_code au moment du fulfillment,
// fulfillOrder DOIT en générer + persister un, puis encoder l'URL COURTE dans le
// QR imprimé (jamais l'URL longue /profil/<uuid>, qui serait figée sur le t-shirt).
//
// Happy path entièrement mocké (Stripe, Supabase, QR, short-code, Printful).

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
  generatePremiumQRCode: vi.fn(() => ({ svg: '<svg/>', buffer: Buffer.from('x'), width: 1, height: 1 })),
  // Monogramme )( poitrine (print face) — uploadé par fulfillOrder quand PRINT_FRONT_LOGO.
  generateBrandMonogramSVG: vi.fn(() => ({ svg: '<svg/>', buffer: Buffer.from('m') })),
}));

vi.mock('@/lib/short-code', () => ({
  generateUniqueShortCode: vi.fn().mockResolvedValue('ab2'),
  buildShortUrl: (code: string) => `https://app.test/r/${code}`,
}));

const paidOrder = { id: 'o1', stripe_session_id: 'sess_1', printful_order_id: null, status: 'paid' };
const membersUpdate = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: paidOrder, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'members') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'm1', short_code: null }, error: null }) }) }),
          update: membersUpdate,
        };
      }
      return {};
    }),
    storage: {
      from: () => ({
        upload:       () => Promise.resolve({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://store.test/qr.svg' } }),
      }),
    },
  },
}));

import { fulfillOrder } from '@/lib/fulfillment';
import { generatePremiumQRCode, generateBrandMonogramSVG } from '@/lib/generate-qr-svg';
import { generateUniqueShortCode } from '@/lib/short-code';

describe('fulfillOrder — garantie short_code (H3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test');
    vi.stubEnv('PRINTFUL_VARIANT_ID_DARK', '123');
    vi.stubEnv('PRINTFUL_API_TOKEN', 'pf_token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: { id: 'pf99' } }),
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('génère + persiste un short_code et encode l\'URL COURTE dans le QR', async () => {
    const res = await fulfillOrder({ orderId: 'o1', memberId: 'm1', tshirtColor: 'dark', tshirtSize: 'M' });

    expect(res.ok).toBe(true);
    expect(res.printfulOrderId).toBe('pf99');

    // Un short_code a été généré...
    expect(generateUniqueShortCode).toHaveBeenCalledTimes(1);
    // ...et persisté sur le membre.
    expect(membersUpdate).toHaveBeenCalledWith(expect.objectContaining({ short_code: 'ab2' }));
    // ...et le QR encode l'URL courte, PAS /profil/<uuid>.
    // 3e arg = style de forme (order de test sans qr_style → fallback 'rounded' = 0.25).
    expect(generatePremiumQRCode).toHaveBeenCalledWith('https://app.test/r/ab2', 'dark', { moduleCorner: 0.25 });
    const urlArg = (generatePremiumQRCode as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(urlArg).not.toContain('/profil/');
  });

  it('envoie DEUX fichiers à Printful : QR au dos + monogramme )( poitrine', async () => {
    await fulfillOrder({ orderId: 'o1', memberId: 'm1', tshirtColor: 'dark', tshirtSize: 'M' });

    // Le monogramme est généré depuis le THÈME du tee (pas depuis le membre).
    expect(generateBrandMonogramSVG).toHaveBeenCalledWith('dark');

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('api.printful.com/orders'));
    expect(call).toBeTruthy();
    const body  = JSON.parse((call![1] as RequestInit).body as string);
    const files = body.items[0].files as Array<{ type: string; position: { width: number; left: number } }>;

    expect(files.map(f => f.type)).toEqual(['back', 'front']);
    expect(files[0].position.width).toBe(800);   // QR : grand, au dos
    expect(files[1].position.width).toBe(300);   // monogramme : petit, poitrine
    // Poitrine GAUCHE du porteur = à droite de la zone d'impression (centre = 750).
    expect(files[1].position.left).toBeGreaterThan(750);
  });
});
