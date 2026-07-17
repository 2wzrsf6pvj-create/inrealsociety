// generateUniqueShortCode doit garantir l'unicité GLOBALE : un code déjà RÉSERVÉ
// sur une commande (orders.short_code) compte comme une collision, au même titre
// qu'un code de membre. Sinon le QR imprimé au paiement pourrait entrer en conflit
// avec un futur membre et pointer vers le mauvais profil.

import { describe, it, expect, vi, beforeEach } from 'vitest';

let membersHits: Array<{ id: string } | null>;
let ordersHits: Array<{ id: string } | null>;
let membersCall = 0;
let ordersCall = 0;

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (table === 'members') return Promise.resolve({ data: membersHits[membersCall++] ?? null });
            if (table === 'orders')  return Promise.resolve({ data: ordersHits[ordersCall++] ?? null });
            return Promise.resolve({ data: null });
          },
        }),
      }),
    })),
  },
}));

import { generateUniqueShortCode } from '@/lib/short-code';
import { supabaseAdmin } from '@/lib/supabase-admin';

describe('generateUniqueShortCode — unicité members ET orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membersCall = 0; ordersCall = 0;
  });

  it('interroge les DEUX tables et renvoie un code quand aucune ne matche', async () => {
    membersHits = [null];
    ordersHits  = [null];

    const code = await generateUniqueShortCode();
    expect(code).toMatch(/^[a-z0-9]{2,6}$/);

    const tables = (supabaseAdmin.from as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(tables).toContain('members');
    expect(tables).toContain('orders');
  });

  it('traite un hit sur orders comme une collision et régénère', async () => {
    // 1re tentative : libre côté members mais RÉSERVÉ côté orders → collision.
    // 2e tentative : libre partout → retenue.
    membersHits = [null, null];
    ordersHits  = [{ id: 'reserved-order' }, null];

    const code = await generateUniqueShortCode();
    expect(code).toMatch(/^[a-z0-9]{2,6}$/);

    // La fonction n'a PAS renvoyé au 1er tour : elle a re-tenté (≥ 2 lookups orders).
    expect(ordersCall).toBeGreaterThanOrEqual(2);
  });
});
