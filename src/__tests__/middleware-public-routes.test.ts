// Middleware : les pages du parcours du passant (anonyme par conception) ne
// renvoient jamais vers la connexion. /conversation/[id] le faisait : le passant
// ne pouvait ni lire la réponse du porteur ni répondre, depuis aucun lien
// (page d'envoi, email, notification push).

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

// Visiteur non connecté.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

let middleware: (req: NextRequest) => Promise<Response>;
let matcher: RegExp;

beforeAll(async () => {
  // Sans ces variables, le middleware laisse tout passer (mode dev) : le test ne
  // prouverait rien. Lues au chargement du module, d'où l'import dynamique.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  const mod = await import('@/middleware');
  middleware = mod.middleware;
  matcher = new RegExp(`^${mod.config.matcher[0]}$`);
});
afterAll(() => { vi.unstubAllEnvs(); });

const ID = '541c253f-592d-4f6e-8de6-d32676a72df1';
const redirectOf = async (path: string) =>
  (await middleware(new NextRequest(`http://localhost:3000${path}`))).headers.get('location');

describe('middleware — parcours du passant anonyme', () => {
  it.each([
    '/r/k7p2q',
    `/profil/${ID}`,
    '/message',
    `/conversation/${ID}`,
    `/api/conversation/${ID}/thread`,
    '/api/profile/report',
    '/tee/en-attente',
    '/opengraph-image',   // image d'aperçu des liens partagés (robots des messageries)
    '/api/shop/tagline/un-message-une-chance',
  ])('%s reste accessible sans compte', async (path) => {
    expect(await redirectOf(path)).toBeNull();
  });

  it('témoin : une page membre renvoie bien vers la connexion', async () => {
    expect(await redirectOf('/dashboard')).toContain('/auth/login');
  });
});

// Le navigateur va chercher ces fichiers seul, sans session : passés par le
// middleware, ils étaient redirigés vers la connexion. Service worker refusé
// (« The script resource is behind a redirect ») → le passant n'était jamais
// notifié de la réponse du porteur ; manifeste illisible → pas d'installation.
describe('middleware — fichiers publics servis tels quels', () => {
  it.each(['/sw.js', '/manifest.json', '/favicon.svg', '/shop/tee-blanc-face.png'])(
    '%s ne passe pas par le middleware', (path) => {
      expect(matcher.test(path)).toBe(false);
    });

  it.each(['/dashboard', `/profil/${ID}`, '/api/messages', '/auth/login', '/robots.txt'])(
    '%s passe toujours par le middleware', (path) => {
      expect(matcher.test(path)).toBe(true);
    });
});
