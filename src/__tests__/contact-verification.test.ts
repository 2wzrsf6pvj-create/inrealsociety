// Vérification de l'email laissé par un passant (double opt-in).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/ratelimit', () => ({ checkContactVerifyRateLimit: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  emailContactVerification: vi.fn((p: { verifyUrl: string }) => ({ subject: 's', html: p.verifyUrl })),
}));
// Tâches confiées à waitUntil (envoi après la réponse).
const handedOver = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('@/lib/wait-until', () => ({ waitUntil: (p: Promise<unknown>) => { handedOver.push(p); } }));

import { startContactVerification, confirmContactToken, isContactVerified, CONTACT_VERIFY_TTL_DAYS } from '@/lib/contact-verification';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkContactVerifyRateLimit } from '@/lib/ratelimit';
import { sendEmail, emailContactVerification } from '@/lib/email-templates';

const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const from = supabaseAdmin.from as ReturnType<typeof vi.fn>;

describe('startContactVerification', () => {
  beforeEach(() => { vi.clearAllMocks(); handedOver.length = 0; });

  it('plafond par adresse atteint : rien n’est créé ni envoyé', async () => {
    (checkContactVerifyRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    expect(await startContactVerification({ messageId: 'm', email: 'a@b.fr', memberName: 'Camille' })).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('crée la vérification (jeton haché, email en minuscules) et envoie le lien', async () => {
    (checkContactVerifyRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const inserted: Record<string, string>[] = [];
    from.mockReturnValue({ insert: (row: Record<string, string>) => { inserted.push(row); return Promise.resolve({ error: null }); } });

    expect(await startContactVerification({ messageId: 'm', email: ' Jeanne@Mail.FR ', memberName: 'Camille' })).toBe(true);
    expect(inserted[0].email).toBe('jeanne@mail.fr');
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'jeanne@mail.fr' }));

    const url = (emailContactVerification as ReturnType<typeof vi.fn>).mock.calls[0][0].verifyUrl as string;
    const token = new URL(url).searchParams.get('token')!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inserted[0].token_hash).toBe(sha256(token));   // jamais le jeton en clair
    expect(inserted[0].token_hash).not.toContain(token);
  });

  it('n’attend pas Resend : l’envoi est confié à waitUntil, le passant a sa réponse tout de suite', async () => {
    (checkContactVerifyRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    from.mockReturnValue({ insert: () => Promise.resolve({ error: null }) });
    const pending = new Promise<boolean>(() => {});   // Resend qui ne répond pas
    (sendEmail as ReturnType<typeof vi.fn>).mockReturnValueOnce(pending);

    expect(await startContactVerification({ messageId: 'm', email: 'a@b.fr', memberName: 'Camille' })).toBe(true);
    expect(handedOver).toEqual([pending]);
  });
});

describe('confirmContactToken', () => {
  beforeEach(() => vi.clearAllMocks());

  function wire(row: Record<string, unknown> | null, updates: unknown[] = []) {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
      update: (u: unknown) => { updates.push(u); return { eq: () => ({ is: () => Promise.resolve({ error: null }) }) }; },
    });
    return updates;
  }

  it('jeton inconnu → invalid', async () => {
    wire(null);
    expect(await confirmContactToken('x'.repeat(43))).toEqual({ status: 'invalid' });
  });

  it('lien trop ancien → expired, sans rien confirmer', async () => {
    const old = new Date(Date.now() - (CONTACT_VERIFY_TTL_DAYS + 1) * 86_400_000).toISOString();
    const updates = wire({ message_id: 'm', email: 'a@b.fr', created_at: old, verified_at: null });
    expect(await confirmContactToken('t')).toEqual({ status: 'expired' });
    expect(updates).toHaveLength(0);
  });

  it('premier clic → ok, confirmé', async () => {
    const updates = wire({ message_id: 'm', email: 'a@b.fr', created_at: new Date().toISOString(), verified_at: null });
    expect(await confirmContactToken('t')).toEqual({ status: 'ok', messageId: 'm', email: 'a@b.fr', firstConfirmation: true });
    expect(updates).toHaveLength(1);
  });

  it('second clic → ok, sans nouvelle confirmation', async () => {
    const updates = wire({ message_id: 'm', email: 'a@b.fr', created_at: new Date().toISOString(), verified_at: new Date().toISOString() });
    expect(await confirmContactToken('t')).toEqual({ status: 'ok', messageId: 'm', email: 'a@b.fr', firstConfirmation: false });
    expect(updates).toHaveLength(0);
  });
});

describe('isContactVerified', () => {
  beforeEach(() => vi.clearAllMocks());

  const wire = (row: Record<string, unknown> | null) =>
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }) });

  it('adresse confirmée, même casse ou non → true', async () => {
    wire({ email: 'a@b.fr', verified_at: '2026-10-22T00:00:00Z' });
    expect(await isContactVerified('m', ' A@B.fr ')).toBe(true);
  });

  it('pas encore confirmée → false', async () => {
    wire({ email: 'a@b.fr', verified_at: null });
    expect(await isContactVerified('m', 'a@b.fr')).toBe(false);
  });

  it('une autre adresse que celle confirmée → false', async () => {
    wire({ email: 'a@b.fr', verified_at: '2026-10-22T00:00:00Z' });
    expect(await isContactVerified('m', 'autre@b.fr')).toBe(false);
  });

  it('aucune vérification (conversation ancienne) → false', async () => {
    wire(null);
    expect(await isContactVerified('m', 'a@b.fr')).toBe(false);
  });
});
