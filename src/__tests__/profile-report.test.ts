// Signalement d'un profil (règlement européen sur les services numériques) :
// ouvert à tous, validé, tracé, alerte à l'équipe ; rien n'est masqué
// automatiquement. Motif et contact sont échappés dans l'email.

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
const report = (body: unknown) => POST({ json: async () => body, headers: new Headers() } as unknown as NextRequest);
const wireMember = (member: { id: string; name: string } | null) =>
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: member }) }) }),
  });

describe('POST /api/profile/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_ALERT_EMAIL', 'equipe@example.com');
    wireMember({ id: MEMBER_ID, name: 'Camille' });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

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
    const res = await report({ memberId: MEMBER_ID, reason: 'Photo choquante.', contact: 'lea@example.com' });
    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'profile.reported', memberId: MEMBER_ID,
      metadata: { reason: 'Photo choquante.', contact: 'lea@example.com' },
    }));
    const mail = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(mail.to).toBe('equipe@example.com');
    expect(mail.html).toContain(`/profil/${MEMBER_ID}`);
    expect(mail.html).toContain('Photo choquante.');
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
