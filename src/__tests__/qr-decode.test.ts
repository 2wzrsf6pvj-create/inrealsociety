// Décodage RÉEL du QR : rend le SVG en PNG (resvg) puis le décode (jsQR).
// Garde-fou fort pour un produit live — un QR qui ne scanne plus = produit mort.
// Couvre le tee NOIR (QR clair sur fond sombre = « inversé », le cas fragile) et
// valide que les variantes de forme restent décodables.

import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { generatePremiumQRCode, composeBackPrintSVG, type QRStyle } from '@/lib/generate-qr-svg';

const URL = 'https://inreal.me/u8';

/** Rend le SVG sur un fond plein (couleur du tee) et tente de le décoder.
 *  Sans les polices du système : ces SVG n'ont aucun texte (accroches en
 *  tracés), et resvg les rechargeait toutes à chaque rendu. Sur un runner au
 *  disque froid, le premier chargement a dépassé les 5 s du test. */
function decode(svg: string, background: string): string | null {
  const resvg = new Resvg(svg, {
    background,
    fitTo: { mode: 'width', value: 1000 },
    font: { loadSystemFonts: false },
  });
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

  it('sans quiet zone (le tissu la fournit), le QR se décode toujours', () => {
    // Le fichier envoyé à Printful n'embarque AUCUNE marge : elle coûtait 12 % de
    // largeur utile, donc 12 % de distance de scan, alors que le tee la fournit.
    const { svg } = generatePremiumQRCode(URL, 'dark', { quietModules: 0 });
    expect(decode(svg, 'black')).toBe(URL);
  });
});

// L'accroche est imprimée SOUS le QR. Elle ne doit jamais casser le décodage.
describe('QR — le dos composé (QR + accroche) décode toujours', () => {
  it('avec accroche, tee noir (cas inversé, le plus fragile)', () => {
    const { svg } = composeBackPrintSVG(URL, 'dark', { taglineId: 'un-message-une-chance' });
    expect(decode(svg, 'black')).toBe(URL);
  });

  it('avec accroche longue, tee blanc', () => {
    const { svg } = composeBackPrintSVG(URL, 'light', { taglineId: 'ecris-sans-connaitre' });
    expect(decode(svg, 'white')).toBe(URL);
  });

  it('sans accroche (id null) → dos carré, identique au QR seul', () => {
    const back = composeBackPrintSVG(URL, 'dark', { taglineId: null });
    expect(back.width).toBe(back.height);   // carré = pas de bande d'accroche
    expect(back.taglineId).toBeNull();
    expect(decode(back.svg, 'black')).toBe(URL);
  });

  it("l'accroche agrandit la hauteur mais JAMAIS la largeur (le QR garde sa taille)", () => {
    const plain = composeBackPrintSVG(URL, 'dark', { taglineId: null });
    const withT = composeBackPrintSVG(URL, 'dark', { taglineId: 'tas-le-cran' });
    expect(withT.width).toBe(plain.width);        // largeur = celle du QR, inchangée
    expect(withT.height).toBeGreaterThan(plain.height);
  });

  it('un id inconnu retombe proprement sur QR seul (jamais de crash)', () => {
    const back = composeBackPrintSVG(URL, 'dark', { taglineId: 'nexiste-pas' });
    expect(back.taglineId).toBeNull();
    expect(back.width).toBe(back.height);
  });
});

// La distance de scan ≈ 10× la largeur imprimée, MAIS la largeur est fixe : c'est le
// nombre de modules qui fait varier la taille d'un module, donc la portée réelle.
// Une URL plus longue = un QR qui se lit de moins loin. Ce lien doit rester visible.
describe('QR — la longueur de l’URL coûte de la distance de scan', () => {
  const modulesFor = (url: string) => generatePremiumQRCode(url, 'dark', { quietModules: 0 }).modules;

  it('URL courte (SHORT_DOMAIN) → 29 modules : l’hypothèse de BACK_WIDTH_CM', () => {
    expect(modulesFor('https://inreal.me/A7kQ')).toBe(29);
  });

  it('fallback sans SHORT_DOMAIN → plus dense, donc portée réduite', () => {
    const fallback = modulesFor('https://inrealsociety.vercel.app/r/A7kQ');
    expect(fallback).toBeGreaterThan(29);
    // À 25 cm de large : 29 modules → ~2,5 m ; 37 modules → ~2,0 m (−22 %).
    const reachM = 2.5 * (29 / fallback);
    expect(reachM).toBeLessThan(2.1);
  });
});
