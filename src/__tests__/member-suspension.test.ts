// Suspension opérateur (migration 054) : un remboursement TOTAL d'une commande dont
// le code a activé un profil suspend ce profil (pause forcée), et le porteur ne
// peut pas lever cette pause lui-même. Un rachat (code jamais consommé) ne suspend
// jamais le profil d'un membre existant.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks partagés ──────────────────────────────────────────────────────────
const updates: { table: string; values: Record<string, unknown>; id?: string }[] = [];
const deletes: { table: string }[] = [];
let memberRow: Record<string, unknown> | null = null;
let codeRow: { used: boolean; member_id: string | null } | null = null;

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single:      () => Promise.resolve({ data: memberRow, error: null }),
          maybeSingle: () => Promise.resolve({
            data: table === 'orders'
              ? { id: 'order-1', status: 'paid', activation_code: 'CODE1234', printful_order_id: null }
              : codeRow,
            error: null,
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updates.push({ table, values, id });
          const res = Promise.resolve({ error: null });
          return Object.assign(res, { eq: () => Promise.resolve({ error: null }) });
        },
      }),
      delete: () => ({ eq: () => { deletes.push({ table }); return Promise.resolve({ error: null }); } }),
    }),
  },
}));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'auth-1' } }),
  isHttpError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/ratelimit', () => ({
  checkAuthRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getIp:              vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:   vi.fn(() => ({})),
}));
const audit = vi.fn();
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock('@/lib/printful-status', () => ({ cancelPrintfulOrder: vi.fn() }));

// Stripe : constructEvent renvoie l'event passé en body (signature non testée ici).
vi.mock('stripe', () => {
  class Stripe {
    webhooks = { constructEvent: (body: string) => JSON.parse(body) };
    static errors = { StripeError: class extends Error {} };
  }
  return { default: Stripe };
});

import { PATCH } from '@/app/api/member/update/route';
import { POST as webhook } from '@/app/api/webhook/stripe/route';

function patchReq(body: Record<string, unknown>): NextRequest {
  return { json: async () => body, cookies: { get: () => undefined }, headers: new Headers() } as unknown as NextRequest;
}

function refundReq(): NextRequest {
  const event = { type: 'charge.refunded', data: { object: {
    payment_intent: 'pi_1', refunded: true, amount: 4900, amount_refunded: 4900,
  } } };
  return {
    text:    async () => JSON.stringify(event),
    headers: new Headers({ 'stripe-signature': 'sig' }),
  } as unknown as NextRequest;
}

beforeEach(() => {
  updates.length = 0; deletes.length = 0; audit.mockClear();
  memberRow = null; codeRow = null;
});

describe('PATCH /api/member/update — profil suspendu', () => {
  it('refuse de lever la pause (403 code=suspended), sans écrire', async () => {
    memberRow = { id: 'm-1', email: 'a@b.c', suspended_at: '2026-10-22T00:00:00Z' };
    const res = await PATCH(patchReq({ is_paused: false }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('suspended');
    expect(updates).toHaveLength(0);
  });

  it('laisse modifier le reste du profil', async () => {
    memberRow = { id: 'm-1', email: 'a@b.c', suspended_at: '2026-10-22T00:00:00Z' };
    const res = await PATCH(patchReq({ pitch: 'nouveau pitch' }));
    expect(res.status).toBe(200);
  });

  it('un profil non suspendu peut lever sa pause', async () => {
    memberRow = { id: 'm-1', email: 'a@b.c', suspended_at: null };
    const res = await PATCH(patchReq({ is_paused: false }));
    expect(res.status).toBe(200);
    expect(updates[0].values).toEqual({ is_paused: false });
  });
});

describe('webhook charge.refunded — suspension du profil activé', () => {
  it('code déjà utilisé → suspend le membre qui l’a activé', async () => {
    codeRow = { used: true, member_id: 'm-1' };
    const res = await webhook(refundReq());
    expect(res.status).toBe(200);
    const suspension = updates.find(u => u.table === 'members');
    expect(suspension?.id).toBe('m-1');
    expect(suspension?.values.is_paused).toBe(true);
    expect(typeof suspension?.values.suspended_at).toBe('string');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.suspended', memberId: 'm-1' }));
  });

  it('code jamais utilisé (ex. rachat) → code supprimé, aucun profil suspendu', async () => {
    codeRow = { used: false, member_id: null };
    await webhook(refundReq());
    expect(updates.find(u => u.table === 'members')).toBeUndefined();
    expect(deletes).toEqual([{ table: 'activation_codes' }]);
  });
});
