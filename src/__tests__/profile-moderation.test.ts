// Textes publics du profil (prénom, présentation, Instagram) : filtrés comme les
// messages avant publication (choix de Clément). Refus expliqué au porteur
// (décision automatique, règle, recours) ; seuls les champs modifiés comptent ;
// à la création, le refus tombe avant de consommer le code d'activation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const updates: Record<string, unknown>[] = [];
const rpc = vi.fn();
let memberRow: Record<string, unknown> = {};

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: memberRow, error: null }) }) }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'auth-1', email: 'alex@example.com' } }),
  isHttpError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/ratelimit', () => ({
  checkAuthRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getIp:              vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:   vi.fn(() => ({})),
}));
const audit = vi.fn();
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock('@/lib/short-code', () => ({ generateUniqueShortCode: vi.fn() }));
vi.mock('@/lib/fulfillment', () => ({ fulfillOrder: vi.fn(), orderQrStoragePath: vi.fn() }));

import { moderateProfileFields, profileRefusalMessage } from '@/lib/moderation';
import { PATCH } from '@/app/api/member/update/route';
import { POST as CREATE } from '@/app/api/member/create/route';

const patch = (body: Record<string, unknown>) =>
  PATCH({ json: async () => body, headers: new Headers() } as unknown as NextRequest);
const create = (body: Record<string, unknown>) =>
  CREATE({ json: async () => ({ activationCode: 'CODE1234', acceptedTerms: true, isAdult: true, ...body }) } as unknown as NextRequest);

// Sans clé OpenAI : le filtre se réduit à la liste de mots, déterministe.
beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  vi.stubEnv('OPENAI_API_KEY', '');
  memberRow = { id: 'm-1', name: 'Camille', pitch: 'Bonjour', instagram: null, suspended_at: null };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('moderateProfileFields', () => {
  it('renvoie le premier champ abusif ; champs vides ou absents ignorés', async () => {
    const refused = await moderateProfileFields({ name: 'Camille', pitch: 'Tu es une salope', instagram: '' });
    expect(refused?.field).toBe('pitch');
    expect(await moderateProfileFields({ name: 'Camille', pitch: undefined, instagram: null })).toBeNull();
  });

  it('le refus dit la décision automatique, la règle et le recours', () => {
    const msg = profileRefusalMessage('pitch');
    expect(msg).toContain('Cette présentation n’a pas été enregistrée');
    expect(msg).toContain('modération automatique');
    expect(msg).toContain('CGV, article 9');
    expect(msg).toContain('hello@inrealsociety.com');
  });
});

describe('PATCH /api/member/update — textes du profil', () => {
  it('présentation abusive → 400 moderated, rien n’est enregistré, trace profile.moderated', async () => {
    const res = await patch({ pitch: 'Tu es une salope' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ code: 'moderated', field: 'pitch' }));
    expect(updates).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'profile.moderated', memberId: 'm-1', metadata: expect.objectContaining({ field: 'pitch' }),
    }));
  });

  it('Instagram abusif (après retrait du @) → refusé', async () => {
    const res = await patch({ instagram: '@connard' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('instagram');
  });

  it('champ inchangé : pas réanalysé, un autre réglage passe', async () => {
    memberRow = { ...memberRow, pitch: 'connard' };   // texte déjà en ligne
    const res = await patch({ pitch: 'connard', require_contact: true });
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual(expect.objectContaining({ require_contact: true }));
  });

  it('textes corrects → enregistrés', async () => {
    const res = await patch({ name: 'Alex', pitch: 'Je cherche des conversations vraies.' });
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual(expect.objectContaining({ name: 'Alex', pitch: 'Je cherche des conversations vraies.' }));
  });
});

describe('POST /api/member/create — textes du profil', () => {
  it('prénom abusif → 400 moderated avant de consommer le code d’activation', async () => {
    const res = await create({ name: 'Connard', pitch: 'Bonjour à tous.' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ code: 'moderated', field: 'name' }));
    expect(rpc).not.toHaveBeenCalled();
  });
});
