// POST /api/conversation/reply : les notifications (email, push, temps réel) sont
// attendues avant la réponse. En serverless, un envoi en tâche de fond peut se
// perdre quand la fonction s'arrête dès la réponse envoyée.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/sender-token', () => ({ getSenderToken: vi.fn(() => 'TOKEN_ORIGINE') }));
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
  sendEmail:           vi.fn(),
  emailNouveauMessage: vi.fn(() => ({ subject: '', html: '' })),
  emailReponse:        vi.fn(() => ({ subject: '', html: '' })),
}));
vi.mock('@/lib/push-notify', () => ({
  notifyThreadSubscribers: vi.fn().mockResolvedValue(undefined),
  notifyMemberSubscribers: vi.fn(),
}));
vi.mock('@/lib/realtime-broadcast', () => ({ broadcastThreadMessage: vi.fn().mockResolvedValue(undefined) }));

import { POST } from '@/app/api/conversation/reply/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNouveauMessage } from '@/lib/email-templates';
import { notifyMemberSubscribers } from '@/lib/push-notify';

const ROOT = '11111111-1111-4111-8111-111111111111';

// Requête PostgREST factice : chaque méthode renvoie la chaîne ; `await` donne `result`.
function chain(result: unknown): unknown {
  const proxy: unknown = new Proxy({}, {
    get: (_t, prop) => prop === 'then'
      ? (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko)
      : () => proxy,
  });
  return proxy;
}

// Le passant répond : racine, compte du fil, dernier message (du porteur),
// insertion, puis le porteur à prévenir.
function wire() {
  const messages = [
    { data: { id: ROOT, member_id: 'm-1', sender_contact: null, blocked_at: null, sender_token: 'TOKEN_ORIGINE' } },
    { count: 2 },
    { data: { author: 'member' } },
    { data: { id: 'reply-1' }, error: null },
  ];
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) =>
    chain(table === 'members' ? { data: { name: 'Camille', email: 'camille@example.com' } } : messages.shift()));
}

const delayed = (flag: { done: boolean }) => () =>
  new Promise((resolve) => setTimeout(() => { flag.done = true; resolve(true); }, 20));

describe('POST /api/conversation/reply — notifications attendues', () => {
  beforeEach(() => { vi.clearAllMocks(); wire(); });

  it('le passant répond : email et push au porteur partis avant la réponse', async () => {
    const email = { done: false };
    const push  = { done: false };
    (sendEmail as ReturnType<typeof vi.fn>).mockImplementation(delayed(email));
    (notifyMemberSubscribers as ReturnType<typeof vi.fn>).mockImplementation(delayed(push));

    const req = { json: async () => ({ messageId: ROOT, content: 'Avec plaisir.', author: 'scanner' }) } as unknown as NextRequest;
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(email.done).toBe(true);
    expect(push.done).toBe(true);
    expect(emailNouveauMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationUrl: expect.stringContaining(`/conversation/${ROOT}`) }));
  });
});
