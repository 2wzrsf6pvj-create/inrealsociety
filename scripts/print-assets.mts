// Régénère les assets d'impression de public/print/ depuis le code (source de vérité).
//
//   npx tsx scripts/print-assets.mts
//
// Produit :
//   qr-back-{dark,light}.svg    — le QR (mockups marketing ; les vraies commandes
//                                 génèrent un QR par membre au fulfillment)
//   logo-front-{dark,light}.svg — le monogramme )( poitrine (identique aux vraies
//                                 commandes, au fichier près)
//   scan-test-A4.svg            — feuille de test de distance, à imprimer à 100 %
//
// Le QR est écrit SANS quiet zone, exactement comme le fichier envoyé à Printful :
// le tissu (ou le papier) fournit la marge. Cf. BACK_POSITION dans fulfillment.ts.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatePremiumQRCode, generateBrandMonogramSVG } from '../src/lib/generate-qr-svg';
import { QR_STYLE_CORNER, DEFAULT_QR_STYLE } from '../src/lib/constants';

const OUT = join(process.cwd(), 'public', 'print');

/** Mockups marketing : « fait vrai » sur une photo produit. */
const DEMO_URL = 'https://inrealsociety.com';

/**
 * Feuille de test : DOIT avoir la densité du QR réellement imprimé (29 modules,
 * ECC-H), sinon on teste un QR plus dur que celui du t-shirt et on se ment.
 * Forme d'une vraie URL courte : `https://inreal.me/<code>`.
 */
const REAL_SHAPE_URL = 'https://inreal.me/A7kQ';

/** Identique au fichier réellement envoyé à Printful (cf. fulfillment.ts). */
const PRINT_STYLE = { moduleCorner: QR_STYLE_CORNER[DEFAULT_QR_STYLE], quietModules: 0 };

for (const theme of ['dark', 'light'] as const) {
  writeFileSync(join(OUT, `qr-back-${theme}.svg`), generatePremiumQRCode(DEMO_URL, theme, PRINT_STYLE).svg);
  writeFileSync(join(OUT, `logo-front-${theme}.svg`), generateBrandMonogramSVG(theme).svg);
}

// ─── Feuille de test de distance ──────────────────────────────────────────────
// Le rapport distance/taille est INVARIANT D'ÉCHELLE : un QR de 15 cm lisible à
// 1,50 m prouve qu'un QR de 25 cm le sera à 2,50 m (même angle sous-tendu, mêmes
// modules par pixel de capteur). 25 cm ne rentre pas sur une A4 — 15 cm, oui.
//
// On imprime la variante LIGHT (noir sur blanc) : la variante dark serait blanche
// sur papier blanc. Le papier plat et bien contrasté est le MEILLEUR cas — le tissu
// (texture, plis, courbure du dos) fera moins bien.
const A4_W = 210, A4_H = 297;         // mm
const QR_MM = 150;                    // → distance équivalente : 1,50 m
const qrLight = generatePremiumQRCode(REAL_SHAPE_URL, 'light', PRINT_STYLE);
if (qrLight.modules !== 29) {
  throw new Error(`Feuille de test : ${qrLight.modules} modules au lieu de 29 — elle ne représente plus le tee.`);
}
const inner = qrLight.svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const scale = QR_MM / qrLight.width;
const qrX = (A4_W - QR_MM) / 2;

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${A4_W}mm" height="${A4_H}mm" viewBox="0 0 ${A4_W} ${A4_H}">
  <rect width="${A4_W}" height="${A4_H}" fill="#ffffff"/>
  <g transform="translate(${qrX},28) scale(${scale})">${inner}</g>

  <text x="${A4_W / 2}" y="20" text-anchor="middle" font-family="Georgia,serif" font-size="6" fill="#000">
    In Real Society — test de distance de scan
  </text>

  <text x="${A4_W / 2}" y="196" text-anchor="middle" font-family="Georgia,serif" font-size="5.2" fill="#000">
    Imprimer a 100 % (aucun ajustement a la page), puis reculer jusqu'a 1,50 m.
  </text>
  <text x="${A4_W / 2}" y="205" text-anchor="middle" font-family="Georgia,serif" font-size="5.2" fill="#000">
    Ca scanne a 1,50 m ? Alors le QR de 25 cm du t-shirt scannera a 2,50 m.
  </text>
  <text x="${A4_W / 2}" y="218" text-anchor="middle" font-family="Georgia,serif" font-size="4.4" fill="#555">
    Papier blanc et plat = meilleur cas. Sur tissu (texture, plis, dos courbe, lumiere
  </text>
  <text x="${A4_W / 2}" y="225" text-anchor="middle" font-family="Georgia,serif" font-size="4.4" fill="#555">
    du soir), compter environ 30 % de moins. Le tee reste le juge final.
  </text>
  <text x="${A4_W / 2}" y="232" text-anchor="middle" font-family="Georgia,serif" font-size="4.4" fill="#555">
    Le lien ne mene nulle part : on teste la LECTURE, pas la destination.
  </text>

  <!-- Barre d'etalonnage : verifie que l'imprimante n'a pas mis a l'echelle -->
  <g transform="translate(${(A4_W - 100) / 2},245)">
    <line x1="0" y1="0" x2="100" y2="0" stroke="#000" stroke-width="0.4"/>
    <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke="#000" stroke-width="0.4"/>
    <line x1="50" y1="-1.5" x2="50" y2="1.5" stroke="#000" stroke-width="0.4"/>
    <line x1="100" y1="-2.5" x2="100" y2="2.5" stroke="#000" stroke-width="0.4"/>
    <text x="50" y="8" text-anchor="middle" font-family="Georgia,serif" font-size="4.4" fill="#000">
      Cette barre doit mesurer exactement 100 mm a la regle
    </text>
  </g>
</svg>`;

writeFileSync(join(OUT, 'scan-test-A4.svg'), sheet);

console.log(`✓ QR ${qrLight.width}px (sans quiet zone) → ${QR_MM} mm sur la feuille de test`);
console.log('✓ public/print/{qr-back,logo-front}-{dark,light}.svg + scan-test-A4.svg');
