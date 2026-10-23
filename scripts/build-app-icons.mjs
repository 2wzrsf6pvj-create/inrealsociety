// scripts/build-app-icons.mjs
// Régénère les icônes de l'app installable (public/) depuis le monogramme ( • ).
//
//   node scripts/build-app-icons.mjs
//
// Pourquoi des PNG : l'iPhone ne lit pas le SVG pour l'écran d'accueil
// (apple-touch-icon) et y mettait une capture floue de la page ; Chrome veut
// 192 et 512 px pour installer l'app. Variantes :
//   - icon-192/512.png       coins arrondis, comme icon.svg (purpose « any ») ;
//   - icon-maskable-512.png  plein cadre : Android le découpe en rond ou en carré
//                            (le logo tient dans le cercle central de 80 %) ;
//   - apple-touch-icon.png   plein cadre : l'iPhone arrondit lui-même les coins ;
//   - notification-badge.png logo blanc sur fond transparent. Android ne garde
//                            que la silhouette du badge : le carré plein donnait
//                            un carré blanc dans la barre de notifications.
// app-installable.test.ts échoue si un fichier ne correspond plus à ce script.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Le monogramme sur 192 × 192 : deux arcs (parenthèses) et la pupille. */
function mark(strokeWidth = 7, dotRadius = 9) {
  return [
    `  <path d="M78 48 Q58 96 78 144" fill="none" stroke="#fff" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `  <path d="M114 48 Q134 96 114 144" fill="none" stroke="#fff" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `  <circle cx="96" cy="96" r="${dotRadius}" fill="#fff"/>`,
  ].join('\n');
}

const svg = (viewBox, lines) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n${lines.join('\n')}\n</svg>\n`;

const ROUNDED = svg('0 0 192 192', [
  '  <rect width="192" height="192" rx="32" fill="#000"/>',
  '  <!-- Le logo ( • ) : deux arcs (parenthèses) formant un œil + la pupille. -->',
  mark(),
]);
const FULL_BLEED = svg('0 0 192 192', ['  <rect width="192" height="192" fill="#000"/>', mark()]);
// Cadré serré et traits épaissis : le badge s'affiche en 24 dp.
const BADGE = svg('40 40 112 112', [mark(10, 11)]);

export const APP_ICONS = [
  { file: 'icon.svg',               svg: ROUNDED },
  { file: 'icon-192.png',           svg: ROUNDED,    size: 192 },
  { file: 'icon-512.png',           svg: ROUNDED,    size: 512 },
  { file: 'icon-maskable-512.png',  svg: FULL_BLEED, size: 512 },
  { file: 'apple-touch-icon.png',   svg: FULL_BLEED, size: 180 },
  { file: 'notification-badge.png', svg: BADGE,      size: 96 },
];

/** Rendu d'une icône à sa taille (fond transparent hors du dessin). */
export function renderIcon({ svg, size }) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const icon of APP_ICONS) {
    writeFileSync(join(PUBLIC, icon.file), icon.size ? renderIcon(icon).asPng() : icon.svg);
    console.log(`✓ public/${icon.file}`);
  }
}
