// src/lib/generate-qr-svg.ts
// Génère un QR code SVG premium avec modules arrondis, yeux stylisés
// et logo central (deux cercles entrecroisés). Adapte les couleurs au thème du t-shirt.
//
// Dark (t-shirt noir)  → QR Gold #C5A059, fond transparent
// Light (t-shirt blanc) → QR Navy #0A192F, logo Gold #C5A059

import qrGenerator from 'qrcode-generator';

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const GOLD = '#C5A059';
const NAVY = '#0A192F';

interface ThemeColors {
  module: string;   // couleur des modules/data du QR
  eye:    string;   // couleur des yeux de positionnement
  logo:   string;   // couleur du logo 'X' central
}

function getThemeColors(theme: 'dark' | 'light'): ThemeColors {
  if (theme === 'dark') {
    return { module: GOLD, eye: GOLD, logo: GOLD };
  }
  return { module: NAVY, eye: NAVY, logo: GOLD };
}

// ─── Matrice QR ───────────────────────────────────────────────────────────────

/** Génère la matrice booléenne du QR code */
function getQrMatrix(url: string): boolean[][] {
  // Type 0 = auto-detect version, Error Correction H (30%)
  const qr = qrGenerator(0, 'H');
  qr.addData(url);
  qr.make();

  const count = qr.getModuleCount();
  const matrix: boolean[][] = [];

  for (let row = 0; row < count; row++) {
    matrix[row] = [];
    for (let col = 0; col < count; col++) {
      matrix[row][col] = qr.isDark(row, col);
    }
  }

  return matrix;
}

// ─── Détection des zones spéciales ────────────────────────────────────────────

/** Vérifie si un module fait partie d'un œil de positionnement (finder pattern) */
function isFinderPattern(row: number, col: number, size: number): boolean {
  // Les 3 finder patterns sont des carrés 7×7 aux coins
  const inTopLeft     = row < 7 && col < 7;
  const inTopRight    = row < 7 && col >= size - 7;
  const inBottomLeft  = row >= size - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

/** Vérifie si un module est dans la zone du logo central */
function isInLogoZone(row: number, col: number, size: number, logoModules: number): boolean {
  const center = size / 2;
  const half   = logoModules / 2;
  return (
    row >= center - half && row < center + half &&
    col >= center - half && col < center + half
  );
}

// ─── Rendu SVG des modules ────────────────────────────────────────────────────

/** Module arrondi (style "dot") — cercle au lieu de carré */
function renderDot(x: number, y: number, size: number, color: string): string {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r  = size * 0.42; // léger gap entre les dots
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
}

/** Œil de positionnement — carré extérieur arrondi + carré intérieur arrondi */
function renderFinderEye(
  x: number,
  y: number,
  moduleSize: number,
  color: string,
): string {
  const s  = moduleSize;
  const rx = s * 0.8; // rayon d'arrondi

  // Carré extérieur (7×7 modules) — bordure seulement
  const outerSize = 7 * s;
  const outer = `<rect x="${x}" y="${y}" width="${outerSize}" height="${outerSize}" rx="${rx}" ry="${rx}" fill="none" stroke="${color}" stroke-width="${s}"/>`;

  // Carré intérieur (3×3 modules) — plein
  const innerX    = x + 2 * s;
  const innerY    = y + 2 * s;
  const innerSize = 3 * s;
  const innerRx   = s * 0.5;
  const inner = `<rect x="${innerX}" y="${innerY}" width="${innerSize}" height="${innerSize}" rx="${innerRx}" ry="${innerRx}" fill="${color}"/>`;

  return outer + inner;
}

// ─── Logo central — deux cercles entrecroisés (connexion) ────────────────────

/** Génère le logo en SVG — deux cercles qui se chevauchent (Venn diagram) */
function renderLogo(
  cx: number,
  cy: number,
  logoSize: number,
  color: string,
): string {
  const half    = logoSize / 2;
  const gap     = logoSize * 0.12;
  const r       = half * 0.55;          // rayon de chaque cercle
  const offset  = half * 0.32;          // décalage horizontal
  const stroke  = logoSize * 0.12;

  // Fond blanc circulaire derrière le logo pour la lisibilité
  const bgRadius = half + gap;
  const bg = `<circle cx="${cx}" cy="${cy}" r="${bgRadius}" fill="white"/>`;

  const c1 = `<circle cx="${cx - offset}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`;
  const c2 = `<circle cx="${cx + offset}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`;

  return bg + c1 + c2;
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export interface QRCodeResult {
  svg:    string;   // SVG complet en string
  buffer: Buffer;   // SVG en Buffer pour upload
  width:  number;   // largeur en px du viewBox
  height: number;   // hauteur en px du viewBox
}

/**
 * Génère un QR code SVG premium pour impression textile.
 *
 * @param url   - URL courte à encoder (ex: https://inreal.me/u8)
 * @param theme - 'dark' (t-shirt noir → QR gold) ou 'light' (t-shirt blanc → QR navy)
 * @returns     - SVG string + Buffer prêts pour upload Printful
 */
export function generatePremiumQRCode(
  url: string,
  theme: 'dark' | 'light',
): QRCodeResult {
  const colors = getThemeColors(theme);
  const matrix = getQrMatrix(url);
  const size   = matrix.length;

  // ─── Dimensions ─────────────────────────────────────────────────────────
  const moduleSize = 40;                          // px par module
  const padding    = moduleSize * 2;              // marge autour du QR
  const qrSize     = size * moduleSize;           // taille du QR seul
  const totalSize  = qrSize + padding * 2;        // taille totale du SVG

  // ─── Zone du logo central ───────────────────────────────────────────────
  // On réserve ~5 modules au centre pour le logo.
  // La correction H (30%) tolère largement cette zone masquée.
  const logoModules = 5;
  const logoSize    = logoModules * moduleSize;
  const logoCx      = padding + qrSize / 2;
  const logoCy      = padding + qrSize / 2;

  // ─── Coordonnées des 3 finder patterns ──────────────────────────────────
  const finderPositions = [
    { row: 0,        col: 0 },           // top-left
    { row: 0,        col: size - 7 },    // top-right
    { row: size - 7, col: 0 },           // bottom-left
  ];

  // ─── Construction du SVG ────────────────────────────────────────────────
  const parts: string[] = [];

  // Header SVG
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">`,
  );

  // Fond transparent (pas de <rect> de fond)

  // 1. Rendu des yeux de positionnement (finder patterns)
  for (const fp of finderPositions) {
    parts.push(renderFinderEye(
      padding + fp.col * moduleSize,
      padding + fp.row * moduleSize,
      moduleSize,
      colors.eye,
    ));
  }

  // 2. Rendu des modules data (dots arrondis)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!matrix[row][col]) continue;
      if (isFinderPattern(row, col, size)) continue;
      if (isInLogoZone(row, col, size, logoModules)) continue;

      const x = padding + col * moduleSize;
      const y = padding + row * moduleSize;

      parts.push(renderDot(x, y, moduleSize, colors.module));
    }
  }

  // 3. Logo 'X' central
  parts.push(renderLogo(logoCx, logoCy, logoSize, colors.logo));

  // Fermeture SVG
  parts.push('</svg>');

  const svg = parts.join('\n');

  return {
    svg,
    buffer: Buffer.from(svg, 'utf-8'),
    width:  totalSize,
    height: totalSize,
  };
}
