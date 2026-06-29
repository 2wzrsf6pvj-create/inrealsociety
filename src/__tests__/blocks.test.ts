// Tests des gardes de blocage/bannissement (anti-abus).
// Invariants : sans sender_token on ne touche PAS la base (et on renvoie false) ;
// présence d'une ligne => true, absence => false.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chaîne supabaseAdmin.from(table).select(col).eq(col,val)[.eq(col,val)].maybeSingle()
const maybeSingle = vi.fn();
const eq2 = vi.fn(() => ({ maybeSingle }));
const eq1 = vi.fn(() => ({ eq: eq2, maybeSingle }));
const select = vi.fn(() => ({ eq: eq1 }));
const from = vi.fn((_table: string) => ({ select }));

vi.mock('@/lib/supabase-admin', () => ({
  // wrapper typé (pas de spread) qui défère l'accès à `from` après son init.
  supabaseAdmin: { from: (table: string) => from(table) },
}));

import { isBlocked, isDeviceBanned } from '@/lib/blocks';

describe('isDeviceBanned', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sans jeton → false, aucune requête', async () => {
    const res = await isDeviceBanned(null);
    expect(res).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('device banni (ligne présente) → true', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { sender_token: 'tok' } });
    const res = await isDeviceBanned('tok');
    expect(res).toBe(true);
    expect(from).toHaveBeenCalledWith('banned_devices');
  });

  it('device non banni (pas de ligne) → false', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await isDeviceBanned('tok')).toBe(false);
  });
});

describe('isBlocked', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sans jeton → false, aucune requête', async () => {
    expect(await isBlocked('member-1', null)).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('blocage présent → true', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'b1' } });
    expect(await isBlocked('member-1', 'tok')).toBe(true);
    expect(from).toHaveBeenCalledWith('blocks');
  });
});
