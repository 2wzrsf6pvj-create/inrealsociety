// Signalement d'un profil ou d'une conversation (règlement européen sur les
// services numériques, art. 16) : ouvert à tous, déclaration de bonne foi,
// tracé, alerte à l'équipe, accusé de réception à l'auteur qui laisse son
// email ; rien n'est masqué automatiquement. Motif et contact sont échappés.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getIp:                vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:     vi.fn(() => ({})),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from '@/app/api/profile/report/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { sendEmail, emailProfileReportAlert } from '@/lib/email-templates';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const report = (body: Record<string, unknown>) =>
  POST({ json: async () => ({ goodFaith: true, ...body }), headers: new Headers() } as unknown as NextRequest);
// members : le profil signalé ; messages : la conversation, si elle est bien à ce porteur.
const wireMember = (member: { id: string; name: string } | null, conversation: { id: string } | null = null) =>
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => table === 'messages'
    ? { select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: conversation }) }) }) }) }) }
    : { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: member }) }) }) });
const mails = () => (sendEmail as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as { to: string; subject: string; html: string });

describe('POST /api/profile/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_ALERT_EMAIL', 'equipe@example.com');
    wireMember({ id: MEMBER_ID, name: 'Camille' });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('sans la déclaration de bonne foi → 400, rien n’est tracé ni envoyé', async () => {
    const res = await report({ memberId: MEMBER_ID, reason: 'Photo choquante.', goodFaith: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Cochez la case');
    expect(audit).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('motif trop court → 400, rien n’est tracé ni envoyé', async () => {
    const res = await report({ memberId: MEMBER_ID, reason: 'nul' });
    expect(res.status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('profil inconnu → 404', async () => {
    wireMember(null);
    expect((await report({ memberId: MEMBER_ID, reason: 'Photo choquante.' })).status).toBe(404);
  });

  it('trop de signalements depuis la même adresse IP → 429', async () => {
    (checkPublicRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });
    expect((await report({ memberId: MEMBER_ID, reason: 'Photo choquante.' })).status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('signalement valide → tracé, alerte à l’équipe avec le lien du profil', async () => {
    const res = await report({ memberId: MEMBER_ID, reason: 'Photo choquante.', contact: '@lea' });
    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'profile.reported', memberId: MEMBER_ID,
      metadata: { reason: 'Photo choquante.', contact: '@lea', messageId: null },
    }));
    const mail = mails()[0];
    expect(mail.to).toBe('equipe@example.com');
    expect(mail.html).toContain(`/profil/${MEMBER_ID}`);
    expect(mail.html).toContain('Photo choquante.');
    expect(mail.html).toContain('docs/MODERATION.md');
  });

  it('auteur qui laisse son email → accusé de réception ; un @instagram n’en reçoit pas', async () => {
    const withEmail = await report({ memberId: MEMBER_ID, reason: 'Photo choquante.', contact: 'lea@example.com' });
    expect(await withEmail.json()).toEqual({ ok: true, receiptSent: true });
    expect(mails().map((m) => m.to)).toEqual(['equipe@example.com', 'lea@example.com']);
    expect(mails()[1].subject).toBe('Votre signalement a bien été reçu');

    vi.clearAllMocks();
    const withHandle = await report({ memberId: MEMBER_ID, reason: 'Photo choquante.', contact: '@lea' });
    expect(await withHandle.json()).toEqual({ ok: true, receiptSent: false });
    expect(mails().map((m) => m.to)).toEqual(['equipe@example.com']);
  });

  it('depuis une conversation de ce porteur → lien de la conversation dans l’alerte', async () => {
    wireMember({ id: MEMBER_ID, name: 'Camille' }, { id: MESSAGE_ID });
    expect((await report({ memberId: MEMBER_ID, messageId: MESSAGE_ID, reason: 'Réponses insistantes.' })).status).toBe(200);
    expect(mails()[0].subject).toBe('Signalement\u00a0: une conversation a été signalée');
    expect(mails()[0].html).toContain(`/conversation/${MESSAGE_ID}`);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ messageId: MESSAGE_ID }),
    }));
  });

  it('conversation d’un autre porteur → ignorée, le profil reste signalé', async () => {
    wireMember({ id: MEMBER_ID, name: 'Camille' }, null);
    expect((await report({ memberId: MEMBER_ID, messageId: MESSAGE_ID, reason: 'Réponses insistantes.' })).status).toBe(200);
    expect(mails()[0].subject).toBe('Signalement\u00a0: un profil a été signalé');
    expect(mails()[0].html).not.toContain('/conversation/');
  });

  it('sans ADMIN_ALERT_EMAIL : le signalement est quand même tracé', async () => {
    vi.stubEnv('ADMIN_ALERT_EMAIL', '');
    expect((await report({ memberId: MEMBER_ID, reason: 'Pseudo insultant.' })).status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'profile.reported' }));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('emailProfileReportAlert', () => {
  it('échappe motif et contact (texte libre d’un inconnu)', () => {
    const { html } = emailProfileReportAlert({
      memberName: 'Camille', memberId: MEMBER_ID, profileUrl: `https://example.com/profil/${MEMBER_ID}`,
      reason: '<script>alert(1)</script>', contact: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
});
