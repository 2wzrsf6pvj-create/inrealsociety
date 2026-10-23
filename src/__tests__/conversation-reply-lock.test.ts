// Sécurité : une réponse « scanner » ne peut venir QUE du device d'origine
// (cookie sender_token httpOnly). Le lien-capability laisse LIRE la conversation,
// pas y injecter des messages « du scanneur » s'il fuite. Ce test verrouille ça.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/sender-token', () => ({ getSenderToken: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: vi.fn().mockResolvedValue({ success: true }),
  checkAuthRateLimit:   vi.fn().mockResolvedValue({ success: true }),
  getIp:                vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:     vi.fn(() => ({})),
}));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: vi.fn(), requireOwnership: vi.fn(), isHttpError: vi.fn(() => false),
}));
vi.mock('@/lib/blocks', () => ({
  isBlocked: vi.fn().mockResolvedValue(false), isDeviceBanned: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/moderation', () => ({ moderateContent: vi.fn().mockResolvedValue({ flagged: false }) }));
vi.mock('@/lib/email-templates', () => ({
  sendEmail: vi.fn(), emailNouveauMessage: vi.fn(() => ({ subject: '', html: '' })),
  emailReponse: vi.fn(() => ({ subject: '', html: '' })),
}));
vi.mock('@/lib/push-notify', () => ({ notifyThreadSubscribers: vi.fn(), notifyMemberSubscribers: vi.fn() }));
vi.mock('@/lib/realtime-broadcast', () => ({ broadcastThreadMessage: vi.fn() }));

import { POST } from '@/app/api/conversation/reply/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSenderToken } from '@/lib/sender-token';
import { isBlocked, isDeviceBanned } from '@/lib/blocks';

const UUID = '11111111-1111-4111-8111-111111111111';

// rootMsg : select().eq().is().maybeSingle() → message racine avec un sender_token.
function wireRoot(sender_token: string | null) {
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    select: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({
      data: { id: UUID, member_id: UUID, sender_contact: null, blocked_at: null, sender_token },
      error: null,
    }) }) }) }),
  }));
}

const makeReq = (body: Record<string, unknown>): NextRequest =>
  ({ json: async () => body } as unknown as NextRequest);

describe('POST /api/conversation/reply — verrou anti-imposture scanneur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('réponse scanner avec un sender_token qui NE correspond PAS → 403 wrong_device', async () => {
    wireRoot('TOKEN_ORIGINE');
    (getSenderToken as ReturnType<typeof vi.fn>).mockReturnValue('TOKEN_ATTAQUANT');
    const res = await POST(makeReq({ messageId: UUID, content: 'salut', author: 'scanner' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('wrong_device');
  });

  it('device SANS cookie (token absent) sur une conv liée → 403 wrong_device', async () => {
    wireRoot('TOKEN_ORIGINE');
    (getSenderToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const res = await POST(makeReq({ messageId: UUID, content: 'salut', author: 'scanner' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('wrong_device');
  });
});

describe('POST /api/conversation/reply — appareil bloqué ou banni', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireRoot('TOKEN_ORIGINE');
    (getSenderToken as ReturnType<typeof vi.fn>).mockReturnValue('TOKEN_ORIGINE');
  });

  it('bloqué par le porteur → « conversation close », sans révéler le blocage', async () => {
    (isBlocked as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const res = await POST(makeReq({ messageId: UUID, content: 'salut', author: 'scanner' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Cette conversation est close.', code: 'blocked' });
  });

  it('banni de la plateforme → dit clairement, avec la règle et le recours', async () => {
    (isDeviceBanned as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const res = await POST(makeReq({ messageId: UUID, content: 'salut', author: 'scanner' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('banned');
    expect(data.error).toContain('CGV, article 9');
  });
});
