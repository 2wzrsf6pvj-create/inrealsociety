// « Voir le QR » dans /admin (tester de A à Z) : le QR affiché se lit
// réellement à sa taille d'écran (240 px), et encode l'adresse du QR imprimé :
// le domaine court s'il est réglé, sinon <site>/r/<code>.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { adminQr } from '@/lib/admin-qr';
import { APP_URL } from '@/lib/constants';

/** Comme l'appareil photo d'un téléphone devant l'écran : rendu sur fond
 *  blanc, à la taille affichée. */
function scan(image: string): string | null {
  const svg = Buffer.from(image.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  const png = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: 240 }, font: { loadSystemFonts: false } }).render();
  return jsQR(new Uint8ClampedArray(png.pixels), png.width, png.height)?.data ?? null;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('QR de /admin', () => {
  it('domaine court réglé : inreal.me/<code>, lisible à 240 px', () => {
    vi.stubEnv('SHORT_DOMAIN', 'https://inreal.me');
    const qr = adminQr('k7p2q');
    expect(qr.url).toBe('https://inreal.me/k7p2q');
    expect(scan(qr.image)).toBe('https://inreal.me/k7p2q');
  });

  it('sans domaine court (recette sur l’adresse provisoire) : <site>/r/<code>, lisible aussi', () => {
    vi.stubEnv('SHORT_DOMAIN', '');
    const qr = adminQr('k7p2q');
    expect(qr.url).toBe(`${APP_URL}/r/k7p2q`);
    expect(scan(qr.image)).toBe(`${APP_URL}/r/k7p2q`);
  });

  it('adresse provisoire longue, QR plus dense : lisible aussi à 240 px', () => {
    vi.stubEnv('SHORT_DOMAIN', 'https://inrealsociety-clements-projects-a08d6ce0.vercel.app/r');
    const qr = adminQr('k7p2q9');
    expect(scan(qr.image)).toBe('https://inrealsociety-clements-projects-a08d6ce0.vercel.app/r/k7p2q9');
  });
});
