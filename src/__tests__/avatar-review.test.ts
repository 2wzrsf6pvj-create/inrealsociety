// Photo de profil : publique dès l'envoi, sans filtre automatique (choix de
// Clément). Chaque nouvelle photo part à l'équipe, avec de quoi la retirer.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const PUBLIC_URL = 'https://cdn.example.com/avatars/m-1/avatar.png';

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'm-1', name: 'Camille' } }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
    storage: {
      from: () => ({
        upload:       async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: PUBLIC_URL } }),
      }),
    },
  },
}));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'auth-1' } }),
  isHttpError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/ratelimit', () => ({
  checkAuthRateLimit: vi.fn().mockResolvedValue({ success: true }),
  rateLimitHeaders:   vi.fn(() => ({})),
}));
const audit = vi.fn();
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from '@/app/api/member/avatar/route';
import { sendEmail } from '@/lib/email-templates';

// En-tête PNG : le type réel est lu dans le contenu, pas dans le nom du fichier.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const upload = () => {
  const form = new FormData();
  form.append('file', new File([PNG], 'photo.png', { type: 'image/png' }));
  return POST({ headers: new Headers({ 'content-length': '200' }), formData: async () => form } as unknown as NextRequest);
};

describe('POST /api/member/avatar — coup d’œil de l’équipe', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ADMIN_ALERT_EMAIL', 'equipe@example.com'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('nouvelle photo → email à l’équipe avec la photo et le SQL pour la retirer', async () => {
    const res = await upload();
    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.photo_updated', memberId: 'm-1' }));
    const mail = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(mail.to).toBe('equipe@example.com');
    expect(mail.subject).toBe('Photo de profil à vérifier');
    expect(mail.html).toContain(`${PUBLIC_URL}?v=`);   // contourne le cache de l'image
    expect(mail.html).toContain("UPDATE members SET photo_url = NULL WHERE id = 'm-1'");
    expect(mail.html).toContain('member.photo_removed');
  });

  it('sans ADMIN_ALERT_EMAIL : la photo est quand même enregistrée', async () => {
    vi.stubEnv('ADMIN_ALERT_EMAIL', '');
    expect((await upload()).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('échec de l’email : la photo reste enregistrée', async () => {
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Resend en panne'));
    expect((await upload()).status).toBe(200);
  });
});
