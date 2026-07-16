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
  // Dos = QR + accroche composés en un seul SVG (le carré 1×1 suffit pour ce test).
  composeBackPrintSVG: vi.fn(() => ({ svg: '<svg/>', buffer: Buffer.from('x'), width: 1, height: 1, modules: 29, taglineId: null })),
  // Monogramme )( poitrine (print face) — uploadé par fulfillOrder quand PRINT_FRONT_LOGO.
  generateBrandMonogramSVG: vi.fn(() => ({ svg: '<svg/>', buffer: Buffer.from('m'), width: 900, height: 496 })),
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

import { fulfillOrder, BACK_POSITION, PRINT_QUIET_MODULES } from '@/lib/fulfillment';
import { composeBackPrintSVG, generateBrandMonogramSVG } from '@/lib/generate-qr-svg';
import { generateUniqueShortCode } from '@/lib/short-code';

// Ces constantes gouvernent un OBJET PHYSIQUE. Les changer sans mesurer, c'est
// imprimer des t-shirts qui ne scannent pas. Distance ≈ 10× la largeur du QR.
describe('Géométrie d’impression — la distance de scan est un contrat', () => {
  const PX_PER_CM = 1800 / 30.48;   // 12" de large, DTG adulte

  it('le QR du dos vise ~2,5 m de distance de scan (25 cm de large)', () => {
    const widthCm = BACK_POSITION.width / PX_PER_CM;
    expect(widthCm).toBeCloseTo(25, 0);
    expect(widthCm * 10 / 100).toBeCloseTo(2.5, 1);   // règle 10:1 → mètres
  });

  it('le QR reste DANS la zone imprimable et centré horizontalement', () => {
    expect(BACK_POSITION.left).toBe((1800 - BACK_POSITION.width) / 2);
    expect(BACK_POSITION.left + BACK_POSITION.width).toBeLessThanOrEqual(1800);
    expect(BACK_POSITION.top + BACK_POSITION.height).toBeLessThanOrEqual(2400);
  });

  it('le QR est carré (sinon les modules sont déformés → illisible)', () => {
    expect(BACK_POSITION.width).toBe(BACK_POSITION.height);
  });

  it('le fichier imprimé ne porte AUCUNE quiet zone (le tissu la fournit)', () => {
    // 2 modules de marge de chaque côté mangeaient 12 % de la largeur utile,
    // donc 12 % de distance de scan, pour rien.
    expect(PRINT_QUIET_MODULES).toBe(0);
  });
});

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
    // ...et le dos encode l'URL courte, PAS /profil/<uuid>.
    // 3e arg : forme (order de test sans qr_style → fallback 'rounded' = 0.25) + accroche
    // (order de test sans tagline_id → null = QR seul).
    expect(composeBackPrintSVG).toHaveBeenCalledWith(
      'https://app.test/r/ab2', 'dark', { moduleCorner: 0.25, taglineId: null },
    );
    const urlArg = (composeBackPrintSVG as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
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
    const files = body.items[0].files as Array<{ type: string; position: { width: number; height: number; left: number } }>;

    expect(files.map(f => f.type)).toEqual(['back', 'front']);
    // QR : dimensionné pour ~2,5 m de scan (cf. « Géométrie d'impression »).
    expect(files[0].position.width).toBe(BACK_POSITION.width);
    // Face = lockup )( + « IN REAL SOCIETY » : PAYSAGE (plus large que haut), ~9 cm.
    expect(files[1].position.width).toBeGreaterThan(300);
    expect(files[1].position.height).toBeLessThan(files[1].position.width);
    // Poitrine GAUCHE du porteur = à droite de la zone d'impression (centre = 750).
    expect(files[1].position.left).toBeGreaterThan(750);
  });
});
