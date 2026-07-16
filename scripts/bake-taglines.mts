// Pré-cuit chaque accroche de la bibliothèque en TRACÉ VECTORIEL (outline), une fois,
// hors-ligne → src/lib/taglines.generated.ts.
//
//   npx tsx scripts/bake-taglines.mts
//
// Pourquoi : à l'impression, un <text> dépend d'une police que le moteur de rendu du POD
// (Printful/Gelato) n'a peut-être pas → texte remplacé ou disparu sur le tee. Un tracé
// détouré n'a AUCUNE dépendance. Même discipline que le monogramme )( .
//
// Police : Cormorant Garamond 400 — LA MÊME que « IN REAL SOCIETY » sous le logo
// (cf. brand-name.generated). L'accroche sous le QR et le nom sous le mark partagent
// donc la même griffe. On la fige ici : le rendu imprimé ne dépend plus d'une police.

import opentype from 'opentype.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAGLINES } from '../src/lib/taglines';

const FONT_SIZE = 200;   // unité de cuisson ; la composition rescale ensuite

// Sources candidates pour Cormorant Garamond 400 STATIQUE. On prend la première valide.
const FONT_URLS = [
  'https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-normal.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf',
];

function isTTF(buf: Buffer): boolean {
  const sig = buf.readUInt32BE(0);
  return sig === 0x00010000 || sig === 0x4f54544f /* OTTO */ || sig === 0x74727565 /* true */;
}

async function loadFont(): Promise<opentype.Font> {
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) { console.warn(`  ✗ ${res.status} ${url}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isTTF(buf)) { console.warn(`  ✗ pas un TTF : ${url}`); continue; }
      const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      // sanity : la police doit savoir tracer un accent français
      if (!font.getPath('é', 0, 0, FONT_SIZE).toPathData(1)) throw new Error('glyphe vide');
      console.log(`  ✓ police : ${url}`);
      return font;
    } catch (e) {
      console.warn(`  ✗ ${url} — ${(e as Error).message}`);
    }
  }
  throw new Error('Aucune source de police Montserrat Bold accessible.');
}

interface Baked {
  id: string;
  registre: string;
  text: string;
  path: string;                                   // tracé à baseline (0,0), taille FONT_SIZE
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

interface Outlined {
  d: string;
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Détoure une chaîne GLYPHE PAR GLYPHE et sérialise le tracé À LA MAIN.
 *
 * Deux bugs d'opentype.js 2.0 sur cette police, tous deux contournés :
 *  1. `font.getPath(string)` émet des `NaN` dès le 2e glyphe (mise en page cassée).
 *  2. Même `path.toPathData()` sur un tracé composé émet des `NaN` à la frontière de
 *     certains glyphes, alors que chaque commande prise seule est finie.
 *
 * Donc : on récupère les commandes de CHAQUE glyphe à x=0 (propres, vérifiées finies),
 * on les décale en JS, et on écrit le `d` nous-mêmes. Un sérialiseur maison sur des
 * nombres finis ne peut pas produire de NaN. (Même esprit que le monogramme figé.)
 */
function outlineText(font: opentype.Font, text: string, size: number): Outlined {
  const scale = size / font.unitsPerEm;
  const r = (v: number) => Math.round(v * 100) / 100;
  let x = 0;
  let prev: opentype.Glyph | null = null;
  let d = '';
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const pt = (px: number, py: number) => { x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py); };

  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (prev) { const k = font.getKerningValue(prev, glyph); if (Number.isFinite(k)) x += k * scale; }
    for (const c of glyph.getPath(0, 0, size).commands as Array<Record<string, number>>) {
      const t = c.type as unknown as string;
      if (t === 'M')      { const X = c.x + x; d += `M${r(X)} ${r(c.y)}`; pt(X, c.y); }
      else if (t === 'L') { const X = c.x + x; d += `L${r(X)} ${r(c.y)}`; pt(X, c.y); }
      else if (t === 'Q') { const X1 = c.x1 + x, X = c.x + x; d += `Q${r(X1)} ${r(c.y1)} ${r(X)} ${r(c.y)}`; pt(X1, c.y1); pt(X, c.y); }
      else if (t === 'C') { const X1 = c.x1 + x, X2 = c.x2 + x, X = c.x + x; d += `C${r(X1)} ${r(c.y1)} ${r(X2)} ${r(c.y2)} ${r(X)} ${r(c.y)}`; pt(X1, c.y1); pt(X2, c.y2); pt(X, c.y); }
      else if (t === 'Z') { d += 'Z'; }
    }
    x += glyph.advanceWidth * scale;
    prev = glyph;
  }
  return { d, bbox: { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2) } };
}

const font = await loadFont();
const baked: Baked[] = [];

for (const t of TAGLINES) {
  const { d, bbox } = outlineText(font, t.text, FONT_SIZE);
  if (!d || d.includes('NaN')) throw new Error(`Tracé invalide pour « ${t.text} » (NaN/vide)`);
  baked.push({ id: t.id, registre: t.registre, text: t.text, path: d, bbox });
}

const header = `// GÉNÉRÉ par scripts/bake-taglines.mts — NE PAS ÉDITER À LA MAIN.
// Tracés vectoriels des accroches (Montserrat Bold), détourés pour l'impression :
// aucune dépendance à une police au rendu POD. Régénérer : npx tsx scripts/bake-taglines.mts
//
// Repère : chaque \`path\` est tracé à la baseline (origine 0,0), corps ${FONT_SIZE}.
// \`bbox\` donne l'encombrement réel (y négatif = au-dessus de la baseline).

export interface BakedTagline {
  id: string;
  path: string;
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

export const TAGLINE_FONT_SIZE = ${FONT_SIZE};

export const BAKED_TAGLINES: Record<string, BakedTagline> = {
`;

const body = baked
  .map((b) => `  ${JSON.stringify(b.id)}: { id: ${JSON.stringify(b.id)}, path: ${JSON.stringify(b.path)}, bbox: ${JSON.stringify(b.bbox)} },`)
  .join('\n');

const out = `${header}${body}\n};\n`;
const dest = join(process.cwd(), 'src', 'lib', 'taglines.generated.ts');
writeFileSync(dest, out);

console.log(`✓ ${baked.length} accroches détourées → src/lib/taglines.generated.ts`);
