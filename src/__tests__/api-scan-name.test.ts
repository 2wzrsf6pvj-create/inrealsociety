// POST /api/scan : le prénom du passant est affiché au porteur (email « … vient de
// voir votre profil », tableau de bord). Point d'accès public → format prénom
// imposé côté serveur, puis modération. Invalide ou signalé : ignoré, le scan
// est enregistré sans prénom.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/ratelimit', () => ({
  checkScanRateLimit: vi.fn().mockResolvedValue({ success: true }),
  isNewScan:          vi.fn().mockResolvedValue(true),
  releaseScanDedup:   vi.fn(),
  getIp:              vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:   vi.fn(() => ({})),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/email-templates', () => ({
  sendEmail:        vi.fn().mockResolvedValue(true),
  emailNouveauScan: vi.fn(() => ({ subject: '', html: '' })),
}));
vi.mock('@/lib/moderation', () => ({
  moderateContent: vi.fn().mockResolvedValue({ flagged: false, source: 'regex', categories: [] }),
}));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));

import { POST } from '@/app/api/scan/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { moderateContent } from '@/lib/moderation';
import { emailNouveauScan } from '@/lib/email-templates';

const MEMBER = { id: '11111111-1111-4111-8111-111111111111', name: 'Camille', email: 'camille@example.com', is_paused: false };

function scan(scannerName: string | null) {
  const req = { json: async () => ({ memberId: MEMBER.id, scannerName }) } as unknown as NextRequest;
  return POST(req);
}

const recordedName = () =>
  (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1].p_scanner_name;

describe('POST /api/scan — prénom du passant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: MEMBER, error: null }) }) }),
    });
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
  });

  it('prénom valide et non signalé → enregistré et montré au porteur', async () => {
    const res = await scan('Léa');
    expect(res.status).toBe(200);
    expect(recordedName()).toBe('Léa');
    expect(emailNouveauScan).toHaveBeenCalledWith(expect.objectContaining({ scannerName: 'Léa' }));
  });

  it('texte hors format de prénom (phrase, chiffres) → ignoré, sans même le modérer', async () => {
    await scan('Je sais où tu habites 0612345678');
    expect(recordedName()).toBeNull();
    expect(moderateContent).not.toHaveBeenCalled();
    expect(emailNouveauScan).toHaveBeenCalledWith(expect.objectContaining({ scannerName: undefined }));
  });

  it('prénom au bon format mais signalé par la modération → ignoré', async () => {
    (moderateContent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ flagged: true, source: 'regex', categories: [] });
    await scan('Salope');
    expect(moderateContent).toHaveBeenCalledWith('Salope');
    expect(recordedName()).toBeNull();
    expect(emailNouveauScan).toHaveBeenCalledWith(expect.objectContaining({ scannerName: undefined }));
  });

  it('sans prénom → scan anonyme', async () => {
    await scan(null);
    expect(recordedName()).toBeNull();
  });
});
