// Lot performance : ce que chaque page télécharge.
// - la boutique ne reçoit plus les tracés de TOUTES les accroches (~230 ko
//   compressés) : elle charge celle choisie, à la demande ;
// - PostHog (~60 ko) n'est téléchargé qu'après consentement ;
// - le client Supabase (~56 ko) du bouton « Connexion » ne l'est que si une
//   session existe.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, generateStaticParams } from '@/app/api/shop/tagline/[id]/route';
import { BAKED_TAGLINES } from '@/lib/taglines.generated';
import { hasSupabaseSessionCookie } from '@/lib/session-cookie';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf-8');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe('accroches : une à la fois', () => {
  const [id] = Object.keys(BAKED_TAGLINES);

  it('la route renvoie le tracé et l’encombrement d’une accroche connue', async () => {
    const res = GET(new Request('http://x'), { params: { id } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: BAKED_TAGLINES[id].path, bbox: BAKED_TAGLINES[id].bbox });
  });

  it.each(['inconnue', '__proto__', 'constructor'])('« %s » : 404', (bad) => {
    expect(GET(new Request('http://x'), { params: { id: bad } }).status).toBe(404);
  });

  it('une réponse statique par accroche, générée au build', () => {
    expect(generateStaticParams()).toHaveLength(Object.keys(BAKED_TAGLINES).length);
  });

  it('la boutique n’importe plus le module des tracés (type seulement)', () => {
    const shop = read('app/shop/ShopClient.tsx');
    expect(shop).toMatch(/import type \{ BakedTagline \} from '@\/lib\/taglines\.generated'/);
    expect(shop).not.toMatch(/import \{[^}]*\} from '@\/lib\/taglines\.generated'/);
  });
});

describe('chargements différés', () => {
  it('posthog-js n’est importé statiquement nulle part (seulement à la demande)', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /^import\s+(?!type\b)[^;]*from\s+'posthog-js'/m.test(fs.readFileSync(f, 'utf-8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('le bouton « Connexion » ne charge le client Supabase qu’à la demande', () => {
    const indicator = read('app/components/ui/AuthIndicator.tsx');
    expect(indicator).not.toMatch(/^import [^;]*from '@\/lib\/supabase-browser'/m);
    expect(indicator).toContain("import('@/lib/supabase-browser')");
  });

  it.each([
    ['sb-abcd-auth-token=base64-xyz', true],
    ['theme=dark; sb-abcd-auth-token.0=base64-a; sb-abcd-auth-token.1=b', true],
    ['sb-abcd-auth-token-code-verifier=abc', false],
    ['irs_consent=granted; other=1', false],
    ['', false],
  ])('cookie de session dans « %s » : %s', (cookies, expected) => {
    expect(hasSupabaseSessionCookie(cookies)).toBe(expected);
  });
});

describe('PostHog : téléchargé seulement après consentement', () => {
  const posthog = { __loaded: false, init: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn(), capture: vi.fn() };
  const imported = vi.fn();
  let consent: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    posthog.__loaded = false;
    posthog.init.mockImplementation(() => { posthog.__loaded = true; });
    consent = null;
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => consent });
    vi.doMock('posthog-js', () => { imported(); return { default: posthog }; });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock('posthog-js');
  });

  it('sans consentement : rien n’est téléchargé, rien n’est envoyé', async () => {
    const ph = await import('@/lib/posthog-client');
    expect(await ph.loadAnalytics()).toBeNull();
    ph.captureEvent('shop_viewed' as never);
    expect(imported).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('consentement donné : chargé une fois, opt-in, les événements partent', async () => {
    consent = 'granted';
    const ph = await import('@/lib/posthog-client');
    const ready = vi.fn();
    ph.onAnalyticsReady(ready);
    await ph.loadAnalytics();
    await ph.loadAnalytics();
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(1);
    ph.captureEvent('shop_viewed' as never, { source: 'x' } as never);
    expect(posthog.capture).toHaveBeenCalledWith('shop_viewed', { source: 'x' });
    ph.disableAnalytics();
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
  });
});
