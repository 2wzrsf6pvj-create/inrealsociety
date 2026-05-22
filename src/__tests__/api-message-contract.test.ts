// Contrat des réponses d'erreur de POST /api/message.
// Le composeur (/message) switche sur `data.code` (pas sur la copie FR). Ces
// tests verrouillent ce contrat : window_expired (+ windowHours), conversation_limit,
// paused. Une régression du wording ne doit pas casser la détection client.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/ratelimit', () => ({
  checkMessageRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getIp:                 vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:      vi.fn(() => ({})),
}));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({
  sendEmail: vi.fn(), emailNouveauMessage: vi.fn(() => ({ subject: '', html: '' })),
}));
vi.mock('@/lib/moderation', () => ({
  moderateContent: vi.fn().mockResolvedValue({ flagged: false, source: 'regex', categories: [] }),
}));

import { POST } from '@/app/api/message/route';
import { supabaseAdmin } from '@/lib/supabase-admin';

const UUID = '11111111-1111-4111-8111-111111111111';

// Construit l'implémentation de supabaseAdmin.from selon le scénario.
function wireSupabase({ member, firstScanAt, activeConvs }: {
  member: { id: string; name: string; email: string | null; is_paused: boolean; require_contact?: boolean; plan: string } | null;
  firstScanAt?: string | null;
  activeConvs?: number;
}) {
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'members') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: member, error: null }) }) }) };
    }
    if (table === 'first_scans') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({
        data: firstScanAt ? { first_scan_at: firstScanAt } : null, error: null,
      }) }) }) };
    }
    if (table === 'messages') {
      // .eq().eq().is('parent_id').is('blocked_at') → count
      return { select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ is: () =>
        Promise.resolve({ count: activeConvs ?? 0, error: null }) }) }) }) }) };
    }
    if (table === 'blocks') {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () =>
        Promise.resolve({ data: null, error: null }) }) }) }) };
    }
    return {};
  });
}

// req sans cookie irs_sender (scanneur jamais vu) → getSenderToken renvoie null.
function makeReq(body: Record<string, unknown>): NextRequest {
  return { json: async () => body, cookies: { get: () => undefined } } as unknown as NextRequest;
}

describe('POST /api/message — contrat des codes d\'erreur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('membre en pause → 403 code=paused', async () => {
    wireSupabase({ member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: true, plan: 'free' } });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('paused');
  });

  it('fenêtre expirée (free 24h) → 403 code=window_expired, windowHours=24', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: new Date(Date.now() - 25 * 3_600_000).toISOString(), // il y a 25h
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('window_expired');
    expect(data.windowHours).toBe(24);
  });

  it('fenêtre premium = 48h dans windowHours', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'premium' },
      firstScanAt: new Date(Date.now() - 49 * 3_600_000).toISOString(),
    });
    const data = await (await POST(makeReq({ memberId: UUID, content: 'salut' }))).json();
    expect(data.code).toBe('window_expired');
    expect(data.windowHours).toBe(48);
  });

  it('plafond de conversations atteint (free) → 403 code=conversation_limit', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: null,   // pas de scan → check fenêtre sauté
      activeConvs: 3,      // MAX free = 3
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('conversation_limit');
  });

  it('require_contact actif + aucun contact → 403 code=contact_required', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, require_contact: true, plan: 'free' },
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' })); // pas de senderContact
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('contact_required');
  });
});
