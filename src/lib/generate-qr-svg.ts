// src/lib/generate-qr-svg.ts
// Génère un QR code SVG premium avec modules en carrés arrondis, yeux stylisés
// et logo central « )( » (deux arcs de parenthèses). Adapte les couleurs au thème du t-shirt.
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

/** Module en carré arrondi. Remplit plus de surface que les ronds → meilleur
 *  contraste/scan, look « grille » plus premium. `CORNER` = 0 → carré net,
 *  0.5 → cercle ; 0.28 = compromis doux. `INSET` = léger gap entre modules. */
const DEFAULT_MODULE_CORNER = 0.25;   // 0 = carré net · 0.5 = rond/dot
const DEFAULT_MODULE_INSET  = 0.04;   // resserré : un inset trop large casse le décodage (vérifié)
const DEFAULT_QUIET_MODULES = 2;      // marge actuelle (prod inchangée). Spec QR = 4 ;
                                      // mais en zone d'impression FIXE, +quiet = modules
                                      // plus petits → compromis. Réglable via QRStyle.
function renderModule(x: number, y: number, size: number, color: string, corner: number, insetRatio: number): string {
  const inset = size * insetRatio;
  const s     = size - inset * 2;
  const r     = s * corner;
  return `<rect x="${x + inset}" y="${y + inset}" width="${s}" height="${s}" rx="${r}" ry="${r}" fill="${color}"/>`;
}

/** Chemin SVG d'un rectangle arrondi (sous-chemin `d`, sans M/z englobants). */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} `
       + `a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} `
       + `v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z `;
}

/** Œil de positionnement (finder pattern). PLEIN, géométrie 1:1:3 préservée :
 *  anneau 7×7 (trou 5×5 transparent via fill-rule evenodd → marche sur les 2
 *  thèmes) + centre 3×3 plein. Coins LÉGÈREMENT arrondis (style) sans distordre
 *  la détection. ⚠️ Un cadre creux ou trop arrondi casse le scan (vérifié au décodage). */
function renderFinderEye(x: number, y: number, s: number, color: string): string {
  const ring = `<path fill="${color}" fill-rule="evenodd" d="`
    + roundedRectPath(x, y, 7 * s, 7 * s, s * 0.55)
    + roundedRectPath(x + s, y + s, 5 * s, 5 * s, s * 0.45)
    + `"/>`;
  const inner = `<rect x="${x + 2 * s}" y="${y + 2 * s}" width="${3 * s}" height="${3 * s}" rx="${s * 0.4}" ry="${s * 0.4}" fill="${color}"/>`;
  return ring + inner;
}

// ─── Logo central — « )( » (deux arcs de parenthèses) ────────────────────────

/** Génère le logo en SVG — deux arcs « )( » : à gauche un « ) » bombé vers le
 *  centre, à droite un « ( » bombé vers le centre. Extrémités arrondies. */
function renderLogo(
  cx: number,
  cy: number,
  logoSize: number,
  color: string,
): string {
  const half   = logoSize / 2;
  const gap    = logoSize * 0.12;
  const arm    = half * 0.5;            // demi-hauteur des arcs
  const spread = logoSize * 0.15;       // écart horizontal entre les 2 arcs
  const bow    = logoSize * 0.16;       // profondeur de courbure (vers le centre)
  const stroke = logoSize * 0.13;

  // Fond blanc circulaire derrière le logo pour la lisibilité du scan
  const bgRadius = half + gap;
  const bg = `<circle cx="${cx}" cy="${cy}" r="${bgRadius}" fill="white"/>`;

  // « ) » à gauche : courbe quadratique bombée vers la droite (le centre).
  const lx = cx - spread;
  const rParen = `<path d="M ${lx} ${cy - arm} Q ${lx + bow} ${cy} ${lx} ${cy + arm}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  // « ( » à droite : courbe bombée vers la gauche (le centre).
  const rx = cx + spread;
  const lParen = `<path d="M ${rx} ${cy - arm} Q ${rx - bow} ${cy} ${rx} ${cy + arm}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`;

  return bg + rParen + lParen;
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export interface QRCodeResult {
  svg:    string;   // SVG complet en string
  buffer: Buffer;   // SVG en Buffer pour upload
  width:  number;   // largeur en px du viewBox
  height: number;   // hauteur en px du viewBox
}

/** Options de forme du QR. Défauts = rendu actuel (carrés arrondis). */
export interface QRStyle {
  moduleCorner?: number;   // 0 = carré net · 0.25 (défaut) · 0.5 = rond/dot
  moduleInset?:  number;   // gap entre modules (défaut 0.04 ; trop grand = illisible)
  quietModules?: number;   // marge en modules (défaut 2 ; la spec QR recommande 4)
}

/**
 * Génère un QR code SVG premium pour impression textile.
 *
 * @param url   - URL courte à encoder (ex: https://inreal.me/u8)
 * @param theme - 'dark' (t-shirt noir → QR gold) ou 'light' (t-shirt blanc → QR navy)
 * @param style - options de forme (optionnel ; défauts = rendu actuel)
 * @returns     - SVG string + Buffer prêts pour upload Printful
 */
export function generatePremiumQRCode(
  url: string,
  theme: 'dark' | 'light',
  style?: QRStyle,
): QRCodeResult {
  const moduleCorner = style?.moduleCorner ?? DEFAULT_MODULE_CORNER;
  const moduleInset  = style?.moduleInset  ?? DEFAULT_MODULE_INSET;
  const quietModules = style?.quietModules ?? DEFAULT_QUIET_MODULES;

  const colors = getThemeColors(theme);
  const matrix = getQrMatrix(url);
  const size   = matrix.length;

  // ─── Dimensions ─────────────────────────────────────────────────────────
  const moduleSize = 40;                          // px par module
  const padding    = moduleSize * quietModules;   // marge autour du QR (quiet zone)
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

      parts.push(renderModule(x, y, moduleSize, colors.module, moduleCorner, moduleInset));
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
