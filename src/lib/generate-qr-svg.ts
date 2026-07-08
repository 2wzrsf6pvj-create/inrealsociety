// src/lib/generate-qr-svg.ts
// Génère un QR code SVG premium avec modules en carrés arrondis, yeux stylisés
// et monogramme central « )( ». Adapte les couleurs au thème du t-shirt.
//
// PRINT = MONOCHROME, contraste maximal, une seule encre :
//   Dark  (t-shirt noir)  → tout BLANC sur le tissu (fond transparent)
//   Light (t-shirt blanc) → tout NOIR  sur le tissu (fond transparent)
//
// Pourquoi : c'est le contraste maximal pour un lecteur de QR (or sur noir et navy
// sur blanc en offraient nettement moins), c'est une seule encre à l'impression, et
// le monogramme du dos est enfin de la même couleur que celui de la poitrine.

import qrGenerator from 'qrcode-generator';

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const WHITE = '#FFFFFF';
const BLACK = '#000000';

interface ThemeColors {
  module: string;   // couleur des modules/data du QR
  eye:    string;   // couleur des yeux de positionnement
  logo:   string;   // couleur du monogramme )( central
}

/** L'encre à déposer sur le tissu. Une seule couleur par tee. */
export function getInkColor(theme: 'dark' | 'light'): string {
  return theme === 'dark' ? WHITE : BLACK;
}

function getThemeColors(theme: 'dark' | 'light'): ThemeColors {
  const ink = getInkColor(theme);
  return { module: ink, eye: ink, logo: ink };
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

// ─── Monogramme de marque « )( » — CONTOURS DU VRAI GLYPHE ───────────────────
//
// Le site rend le « )( » comme un GLYPHE typographique : les parenthèses de
// **Cormorant Garamond**, graisse **300** (`font-light`, cf. layout.tsx), avec
// `tracking-[0.05em]`. Les traits y sont *modulés* (fins aux extrémités, épais au
// ventre) et les terminaisons effilées.
//
// Le print utilisait auparavant deux arcs de Bézier dessinés à la main, d'épaisseur
// UNIFORME et à bouts ronds → une forme trapue qui ne ressemblait pas au logo du site
// (elle lisait comme un nœud papillon). On utilise désormais les **contours exacts**
// du glyphe, extraits du TTF variable (défaut wght=300) et figés ici :
//   → aucune dépendance à une police au moment de l'impression (Printful reçoit du
//     vecteur pur), et le print est identique au site.
//
// Repère du tracé : opentype `getPath(0, 0, 1000)` — y vers le bas, ligne de base à 0.
const MONOGRAM_PATH = 'M239-304Q239-211 215-128.50Q191-46 145.50 17.50Q100 81 35 117Q34 118 31.50 115.50Q29 113 31 111Q110 39 145-65Q180-169 180-304Q180-439 145-543Q110-647 31-719Q29-721 31.50-723.50Q34-726 35-725Q100-689 145.50-625.50Q191-562 215-480Q239-398 239-304M429-304Q429-398 453-480Q477-562 522.50-625.50Q568-689 633-725Q635-726 637-723.50Q639-721 637-719Q558-647 523-543Q488-439 488-304Q488-169 523-65Q558 39 637 111Q639 112 637 115Q635 118 633 117Q568 80 522.50 17Q477-46 453-128.50Q429-211 429-304';
const MONOGRAM_BBOX = { x1: 30.11, y1: -725.29, x2: 638, y2: 117.29 };

/**
 * Place le monogramme )( (contours remplis, PAS de stroke) ajusté dans le carré
 * `[x, y, size]`. `padRatio` = marge intérieure (fraction de `size`).
 */
function renderMonogram(x: number, y: number, size: number, color: string, padRatio = 0): string {
  const w = MONOGRAM_BBOX.x2 - MONOGRAM_BBOX.x1;
  const h = MONOGRAM_BBOX.y2 - MONOGRAM_BBOX.y1;
  const inner = size * (1 - 2 * padRatio);
  const s  = Math.min(inner / w, inner / h);   // conserve le ratio (le glyphe est haut)
  const tx = x + (size - w * s) / 2 - MONOGRAM_BBOX.x1 * s;
  const ty = y + (size - h * s) / 2 - MONOGRAM_BBOX.y1 * s;
  return `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(5)})">`
       + `<path d="${MONOGRAM_PATH}" fill="${color}"/></g>`;
}

// ─── Logo central du QR ──────────────────────────────────────────────────────

/**
 * Le monogramme )( au centre du QR.
 *
 * Pas de disque de fond : en monochrome, un )( blanc sur un disque blanc serait
 * invisible. Le tissu joue le fond — les modules sont déjà évidés sur cette zone
 * (la correction d'erreur H tolère les ~2,3 % de modules masqués).
 *
 * Le glyphe )( est plus HAUT que large : ajusté au carré, il touchait les modules
 * et se lisait comme un œil, plus comme deux parenthèses. La marge interne lui rend
 * sa contre-forme.
 */
function renderLogo(
  cx: number,
  cy: number,
  logoSize: number,
  color: string,
): string {
  const half = logoSize / 2;
  return renderMonogram(cx - half, cy - half, logoSize, color, 0.14);
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export interface QRCodeResult {
  svg:     string;   // SVG complet en string
  buffer:  Buffer;   // SVG en Buffer pour upload
  width:   number;   // largeur en px du viewBox
  height:  number;   // hauteur en px du viewBox
  /**
   * Nombre de modules sur un côté (hors quiet zone). C'est LA grandeur qui gouverne
   * la distance de scan : à largeur imprimée constante, plus de modules = modules plus
   * petits = QR lisible de moins loin. Une URL plus longue coûte de la portée.
   */
  modules: number;
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
    buffer:  Buffer.from(svg, 'utf-8'),
    width:   totalSize,
    height:  totalSize,
    modules: size,
  };
}

// ─── Monogramme de marque « )( » — impression POITRINE ────────────────────────

/**
 * Monogramme )( standalone : le vrai glyphe, sans QR ni disque de fond (impression
 * directe sur tissu). Même encre que le QR du dos — blanc sur noir, noir sur blanc.
 *
 * IDENTIQUE POUR TOUS LES PORTEURS (contrairement au QR du dos, unique par membre)
 * → uploadé une seule fois par thème, en upsert (cf. fulfillment.ts).
 */
export function generateBrandMonogramSVG(theme: 'dark' | 'light'): { svg: string; buffer: Buffer } {
  const color = getInkColor(theme);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">',
    renderMonogram(0, 0, 400, color, 0.08),
    '</svg>',
  ].join('\n');
  return { svg, buffer: Buffer.from(svg, 'utf-8') };
}
