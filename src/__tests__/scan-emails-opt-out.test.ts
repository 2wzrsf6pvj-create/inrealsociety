// Emails de scan (migration 061, choix de Clément) : le porteur peut les couper
// dans ses réglages ou par le lien en un clic de l'email. Le lien est signé sur
// son identifiant ; le GET ne coupe rien (les scanners de liens des messageries
// le suivent), seul le POST le fait, celui du bouton ou du client mail.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const updates: { table: string; values: Record<string, unknown>; id: string }[] = [];
let updateError: { message: string } | null = null;
let rateLimited = false;

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: MEMBER_ID, email: 'c@x.fr' }, error: null }) }) }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updates.push({ table, values, id });
          const res = Promise.resolve({ error: updateError });
          return Object.assign(res, { eq: () => res });
        },
      }),
    }),
  },
}));
vi.mock('@/lib/ratelimit', () => ({
  checkPublicRateLimit: vi.fn(async () => ({ success: !rateLimited })),
  checkAuthRateLimit:   vi.fn(async () => ({ success: true })),
  getIp:                vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:     vi.fn(() => ({})),
}));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'auth-1' } }),
  isHttpError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

import { GET, POST } from '@/app/api/scan-emails/unsubscribe/route';
import { PATCH } from '@/app/api/member/update/route';
import { scanEmailsOptOutUrl, signUnsubscribe } from '@/lib/unsubscribe-token';

const link = () => new URL(scanEmailsOptOutUrl(MEMBER_ID)!);
const at = (url: URL, method = 'GET') => new NextRequest(url, { method });

beforeEach(() => {
  updates.length = 0;
  updateError = null;
  rateLimited = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('lien « Ne plus recevoir ces emails »', () => {
  it('signé sur le porteur, vers la route publique', () => {
    const url = link();
    expect(url.pathname).toBe('/api/scan-emails/unsubscribe');
    expect(url.searchParams.get('m')).toBe(MEMBER_ID);
    expect(url.searchParams.get('t')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('GET : confirmation, rien n’est coupé', async () => {
    const res = await GET(at(link()));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="POST"');
    expect(html).toContain(`m=${MEMBER_ID}`);
    expect(updates).toHaveLength(0);
  });

  it('GET : un paramètre en plus n’entre jamais dans la page', async () => {
    const url = link();
    url.searchParams.set('x', '"><script>alert(1)</script>');
    const html = await (await GET(at(url))).text();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('x=');   // seuls m et t, vérifiés, sont recopiés
  });

  it('POST (bouton ou client mail en un clic) : coupé pour ce porteur seulement', async () => {
    const res = await POST(at(link(), 'POST'));
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ table: 'members', values: { scan_emails: false }, id: MEMBER_ID }]);
  });

  it.each([
    ['jeton faux', (u: URL) => u.searchParams.set('t', '0'.repeat(32))],
    ['autre porteur', (u: URL) => u.searchParams.set('m', '22222222-2222-4222-8222-222222222222')],
    ['jeton newsletter du même identifiant', (u: URL) => u.searchParams.set('t', signUnsubscribe(MEMBER_ID))],
    ['identifiant invalide', (u: URL) => u.searchParams.set('m', 'pas-un-uuid')],
  ])('%s : refusé, rien n’est coupé', async (_label, tamper) => {
    const url = link();
    tamper(url);
    expect((await POST(at(url, 'POST'))).status).toBe(400);
    expect(await (await GET(at(url))).text()).toContain('Lien invalide');
    expect(updates).toHaveLength(0);
  });

  it('migration 061 absente : « Impossible pour le moment », erreur notée', async () => {
    updateError = { message: 'column "scan_emails" does not exist' };
    const res = await POST(at(link(), 'POST'));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('Impossible pour le moment');
  });

  it('trop de requêtes : rien n’est coupé', async () => {
    rateLimited = true;
    expect((await POST(at(link(), 'POST'))).status).toBe(429);
    expect(updates).toHaveLength(0);
  });
});

describe('réglage « Email au premier scan du jour »', () => {
  const patch = (body: Record<string, unknown>) =>
    PATCH({ json: async () => body, cookies: { get: () => undefined }, headers: new Headers() } as unknown as NextRequest);

  it.each([false, true])('scan_emails = %s : enregistré', async (value) => {
    expect((await patch({ scan_emails: value })).status).toBe(200);
    expect(updates[0].values).toEqual({ scan_emails: value });
  });

  it('valeur non booléenne : refusée', async () => {
    expect((await patch({ scan_emails: 'non' })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
