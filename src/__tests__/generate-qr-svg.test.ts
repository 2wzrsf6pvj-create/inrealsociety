// src/__tests__/generate-qr-svg.test.ts
// Tests du générateur QR code SVG premium.

import { describe, it, expect } from 'vitest';
import { generatePremiumQRCode } from '@/lib/generate-qr-svg';

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

    it('devrait utiliser la couleur Gold #C5A059 pour les modules', () => {
      expect(result.svg).toContain('#C5A059');
    });

    it('ne devrait PAS utiliser la couleur Navy sur le thème dark', () => {
      expect(result.svg).not.toContain('#0A192F');
    });

    it('devrait contenir des cercles (style dots)', () => {
      expect(result.svg).toContain('<circle');
    });

    it('devrait contenir les yeux arrondis (rect avec rx)', () => {
      expect(result.svg).toMatch(/rx="/);
    });

    it('devrait contenir le logo X (deux lignes croisées)', () => {
      const lineCount = (result.svg.match(/<line /g) || []).length;
      expect(lineCount).toBe(2); // deux barres du X
    });

    it('devrait avoir un fond blanc derrière le logo (lisibilité)', () => {
      // Le cercle blanc de fond du logo
      expect(result.svg).toContain('fill="white"');
    });

    it('devrait avoir stroke-linecap round sur le logo', () => {
      expect(result.svg).toContain('stroke-linecap="round"');
    });
  });

  describe('Thème light (t-shirt blanc)', () => {
    const result = generatePremiumQRCode(TEST_URL, 'light');

    it('devrait utiliser Navy #0A192F pour les modules', () => {
      expect(result.svg).toContain('#0A192F');
    });

    it('devrait utiliser Gold #C5A059 pour le logo X', () => {
      // Le logo doit être gold même sur le thème light
      expect(result.svg).toContain('#C5A059');
    });

    it('devrait contenir les deux couleurs (navy modules + gold logo)', () => {
      expect(result.svg).toContain('#0A192F');
      expect(result.svg).toContain('#C5A059');
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
