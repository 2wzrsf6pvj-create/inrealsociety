// Lien de parrainage : code dédié (migration 060), résolu côté serveur. Les anciens
// liens à identifiant de profil (UUID) restent valables pour la remise.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

import { isReferralToken, isLegacyReferral } from '@/lib/referral-code';
import { resolveReferrer } from '@/lib/referral';
import { supabaseAdmin } from '@/lib/supabase-admin';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('isReferralToken', () => {
  it('accepte un code (alphabet des QR) et un ancien lien à identifiant', () => {
    expect(isReferralToken('kz25hsdzvg')).toBe(true);
    expect(isReferralToken(UUID)).toBe(true);
    expect(isLegacyReferral(UUID)).toBe(true);
    expect(isLegacyReferral('kz25hsdzvg')).toBe(false);
  });

  it('refuse tout le reste', () => {
    for (const v of ['', 'kz25hsdzv', 'kz25hsdzvgx', 'KZ25HSDZVG', 'kz25hsdzvo', 'kz25hsdzv1', "'; drop --", null, 42]) {
      expect(isReferralToken(v)).toBe(false);
    }
  });
});

describe('resolveReferrer', () => {
  const filters: [string, string][] = [];
  beforeEach(() => {
    vi.clearAllMocks();
    filters.length = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ eq: (col: string, val: string) => { filters.push([col, val]); return {
        maybeSingle: () => Promise.resolve({ data: { id: UUID, name: 'Camille', email: 'c@example.com' } }),
      }; } }),
    });
  });

  it('un code est cherché dans referral_code, jamais dans id', async () => {
    expect((await resolveReferrer('kz25hsdzvg'))?.id).toBe(UUID);
    expect(filters).toEqual([['referral_code', 'kz25hsdzvg']]);
  });

  it('un ancien lien à identifiant reste valable', async () => {
    await resolveReferrer(UUID);
    expect(filters).toEqual([['id', UUID]]);
  });

  it('format inconnu → null, sans requête', async () => {
    expect(await resolveReferrer('pas-un-code')).toBeNull();
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
