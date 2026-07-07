// Décodage RÉEL du QR : rend le SVG en PNG (resvg) puis le décode (jsQR).
// Garde-fou fort pour un produit live — un QR qui ne scanne plus = produit mort.
// Couvre le tee NOIR (QR clair sur fond sombre = « inversé », le cas fragile) et
// valide que les variantes de forme restent décodables.

import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { generatePremiumQRCode, type QRStyle } from '@/lib/generate-qr-svg';

const URL = 'https://inreal.me/u8';

/** Rend le SVG sur un fond plein (couleur du tee) et tente de le décoder. */
function decode(svg: string, background: string): string | null {
  const resvg = new Resvg(svg, { background, fitTo: { mode: 'width', value: 1000 } });
  const img = resvg.render();
  const pixels = new Uint8ClampedArray(img.pixels);
  // attemptBoth : jsQR essaie aussi l'inversion → gère le tee noir (QR clair/fond sombre).
  const code = jsQR(pixels, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return code?.data ?? null;
}

describe('QR — décodage réel (resvg + jsqr)', () => {
  it('dark (or sur tee noir) se décode', () => {
    const { svg } = generatePremiumQRCode(URL, 'dark');
    expect(decode(svg, 'black')).toBe(URL);
  });

  it('light (navy sur tee blanc) se décode', () => {
    const { svg } = generatePremiumQRCode(URL, 'light');
    expect(decode(svg, 'white')).toBe(URL);
  });

  // ─── Variantes de forme GARANTIES décodables (tee noir, cas inversé) ──────
  const safeVariants: Array<{ name: string; style: QRStyle }> = [
    { name: 'carrés arrondis (défaut, corner 0.25)', style: {} },
    { name: 'carrés nets (corner 0)',                style: { moduleCorner: 0 } },
    { name: 'arrondi doux (corner 0.35)',            style: { moduleCorner: 0.35 } },
    { name: 'quiet zone 4 (spec)',                   style: { quietModules: 4 } },
  ];
  for (const v of safeVariants) {
    it(`variante SÛRE ${v.name} — dark se décode`, () => {
      const { svg } = generatePremiumQRCode(URL, 'dark', v.style);
      expect(decode(svg, 'black')).toBe(URL);
    });
  }

  // ─── Variantes RISQUÉES : NE se décodent PAS de façon fiable sur tee noir ──
  // Vérifié : dots pleins (0.5) et inset large (0.10) réduisent trop la surface
  // des modules → jsQR échoue à décoder l'image inversée (gold/noir). Ce test
  // ACTE la limite : ne pas livrer ces formes sans un rendu voisin-conscient.
  it('RISQUÉ dots (corner 0.5) — NE décode PAS (tee noir)', () => {
    const { svg } = generatePremiumQRCode(URL, 'dark', { moduleCorner: 0.5 });
    expect(decode(svg, 'black')).toBeNull();
  });
});
