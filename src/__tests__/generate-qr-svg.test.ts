// src/__tests__/generate-qr-svg.test.ts
// Tests du générateur QR code SVG premium.

import { describe, it, expect } from 'vitest';
import { generatePremiumQRCode, generateBrandMonogramSVG } from '@/lib/generate-qr-svg';

const TEST_URL = 'https://inreal.me/u8';

describe('generatePremiumQRCode', () => {
  describe('Thème dark (t-shirt noir)', () => {
    const result = generatePremiumQRCode(TEST_URL, 'dark');

    it('devrait retourner un SVG valide', () => {
      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('</svg>');
    });

    it('devrait retourner un Buffer', () => {
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it('devrait avoir des dimensions positives', () => {
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.width).toBe(result.height); // QR code est carré
    });

    it('devrait imprimer en BLANC sur le tee noir (contraste maximal)', () => {
      expect(result.svg).toContain('#FFFFFF');
    });

    it('ne devrait utiliser AUCUNE autre encre (monochrome, une seule couleur)', () => {
      // Print = 1 seule encre. Ni or, ni navy, ni noir sur le tee noir.
      expect(result.svg).not.toContain('#C5A059');
      expect(result.svg).not.toContain('#0A192F');
      expect(result.svg).not.toContain('#000000');
    });

    it('devrait rendre les modules en carrés arrondis (<rect rx)', () => {
      expect(result.svg).toMatch(/<rect [^>]*rx="/);
    });

    it('devrait avoir des finder patterns PLEINS (anneau evenodd) — fiabilité scan', () => {
      // Garde anti-régression : un finder CREUX (cadre stroke) casse la détection
      // du pattern 1:1:3 → le QR ne se décode plus (vérifié au décodage jsqr).
      expect(result.svg).toContain('fill-rule="evenodd"');
    });

    it('devrait utiliser les CONTOURS du vrai glyphe )( (Cormorant 300), pas un dessin à la main', () => {
      // Garde anti-régression : le print doit être identique au logo du site.
      // Fragment stable du tracé extrait du TTF (début du glyphe « ) »).
      expect(result.svg).toContain('M239-304Q239-211');
      // Contours REMPLIS, donc aucun <path stroke=...> (l'ancien logo était 2 arcs stroke).
      expect(result.svg).not.toMatch(/<path[^>]*stroke=/);
      // Ajusté dans la zone logo via un transform (translate + scale).
      expect(result.svg).toMatch(/<g transform="translate\([^)]+\) scale\([^)]+\)">/);
    });

    it('ne devrait PAS avoir de disque de fond derrière le logo', () => {
      // Garde anti-régression : un disque blanc rendrait le )( blanc invisible sur
      // le tee noir, et déposerait une rondelle d'encre inutile.
      expect(result.svg).not.toContain('<circle');
      expect(result.svg).not.toContain('fill="white"');
    });
  });

  describe('Thème light (t-shirt blanc)', () => {
    const result = generatePremiumQRCode(TEST_URL, 'light');

    it('devrait imprimer en NOIR sur le tee blanc (contraste maximal)', () => {
      expect(result.svg).toContain('#000000');
    });

    it('ne devrait utiliser AUCUNE autre encre (monochrome, une seule couleur)', () => {
      expect(result.svg).not.toContain('#C5A059');
      expect(result.svg).not.toContain('#0A192F');
      expect(result.svg).not.toContain('#FFFFFF');
    });

    it('devrait donner au monogramme du dos la MÊME encre que celui de la poitrine', () => {
      // C'était l'incohérence : )( or au dos, )( navy en poitrine, même vêtement.
      const chest = generateBrandMonogramSVG('light').svg;
      expect(chest).toContain('#000000');
      expect(result.svg).toContain('#000000');
    });
  });

  describe('URL courte = QR aéré', () => {
    const result = generatePremiumQRCode(TEST_URL, 'dark');

    it('devrait générer un QR de petite taille (URL courte → peu de modules)', () => {
      // Avec une URL de 22 chars + correction H, on attend ~25-29 modules
      // Ce qui donne une taille totale < 1500px (29*40 + 2*80 = 1320)
      expect(result.width).toBeLessThanOrEqual(1500);
    });
  });

  describe('Cohérence SVG', () => {
    it('le SVG devrait avoir un viewBox correspondant aux dimensions', () => {
      const result = generatePremiumQRCode(TEST_URL, 'dark');
      expect(result.svg).toContain(`viewBox="0 0 ${result.width} ${result.height}"`);
    });

    it('le Buffer devrait correspondre au SVG string', () => {
      const result = generatePremiumQRCode(TEST_URL, 'dark');
      expect(result.buffer.toString('utf-8')).toBe(result.svg);
    });
  });
});
