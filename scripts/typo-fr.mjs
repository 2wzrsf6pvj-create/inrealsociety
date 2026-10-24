// scripts/typo-fr.mjs
// Typographie française du texte affiché (pages, emails, messages d'erreur) :
//   - espace insécable avant « ? ! : ; » et « », après « « », entre un nombre
//     et « € » ou « % » : le signe ne part plus seul à la ligne ;
//   - apostrophe typographique ’, points de suspension …, guillemets « ».
//
//   node scripts/typo-fr.mjs           → corrige les fichiers de src/
//   node scripts/typo-fr.mjs --check   → liste ce qui reste à corriger, exit 1
//                                        (le test typographie.test.ts l'exige vide)
//
// L'espace insécable s'écrit « \u00a0 » dans une chaîne JavaScript et « &nbsp; »
// dans le texte et les attributs JSX : visible à la relecture. Seul le texte est
// touché, repéré par l'analyseur de TypeScript : jamais le code, les classes CSS,
// les adresses. Hors champ : les accroches imprimées (lib/taglines*), dont le
// tracé est figé dans le fichier d'impression ; les journaux (console.*) et les
// erreurs internes (new Error).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'src');
// Le QR et les accroches imprimés : leur fichier d'impression ne doit pas bouger.
const SKIP_FILES = [/[\\/]__tests__[\\/]/, /[\\/]lib[\\/]taglines(\.generated)?\.ts$/, /[\\/]lib[\\/]generate-qr-svg\.ts$/, /\.d\.ts$/];
/** Appels dont les chaînes ne s'affichent pas. */
const SKIP_CALLEES = /^(console\.\w+|reportError|RegExp|Error|TypeError|RangeError|require|fetch)$/;
/** Attributs JSX qui ne s'affichent pas. */
const SKIP_ATTRS = /^(className|class|style|href|src|srcSet|id|key|type|name|rel|target|role|method|action|htmlFor|inputMode|autoComplete|enterKeyHint|lang|dir|sizes|as|media|crossOrigin|referrerPolicy|data-[\w-]+|xmlns(:\w+)?|viewBox|d|fill|stroke[\w-]*|transform|width|height|x|y|cx|cy|r|points|pattern|accept|form)$/;

const L = 'A-Za-zÀ-ÖØ-öø-ÿŒœ';
/** Du texte : deux mots séparés par une espace (« fill-rule » n'en est pas), ou
 *  un libellé d'attente (« Envoi... »). */
const PROSE = new RegExp(`[${L}]{2,}[ ][${L}]{2,}|^[${L} ]*\\.\\.\\.$`);

/**
 * Corrige un morceau de texte, tel qu'écrit dans le fichier.
 * kind : 'jsx' (texte ou attribut JSX, jamais du code) ou 'js' (chaîne ou
 * gabarit, seulement quand l'ensemble est du texte : cf. typoEdits).
 * afterExpr : le morceau suit une expression (`${prix}€`, `{prix}€`).
 */
export function fixText(raw, kind, { afterExpr = false } = {}) {
  // L'espace insécable telle qu'écrite (\u00a0 dans une chaîne, &nbsp; en JSX),
  // remplacée le temps de la correction par un seul caractère : le « 0 » final
  // de \u00a0 ne passe pas pour un nombre, et une deuxième passe ne change rien.
  const WRITTEN = kind === 'jsx' ? '&nbsp;' : '\\u00a0';
  const NB = '\uE000';
  let s = raw.split(WRITTEN).join(NB);

  // Guillemets anglais → « ». En JSX, les guillemets droits (&quot;) aussi :
  // ouvrants en début de mot, fermants ailleurs. Pas dans les chaînes, où ils
  // délimitent souvent des attributs HTML.
  s = s.replace(/(?:&ldquo;|“)\s*/g, `«${NB}`).replace(/\s*(?:&rdquo;|”)/g, `${NB}»`);
  if (kind === 'jsx') {
    s = s.replace(/&quot;/g, (m, i) => ((i === 0 ? !afterExpr : /[\s(]$/.test(s.slice(0, i))) ? `«${NB}` : `${NB}»`));
  }

  // Apostrophe typographique entre deux lettres.
  s = s.replace(new RegExp(`([${L}])(?:&apos;|\\\\'|')(?=[${L}])`, 'g'), '$1’');

  // Points de suspension.
  s = s.replace(/\.\.\.(?!\.)/g, '…');

  // Espaces insécables : dans les guillemets, puis avant ? ! : ;
  s = s.replace(new RegExp(`«(?!${NB})[ ]*`, 'g'), `«${NB}`);
  s = s.replace(new RegExp(`(?<!${NB})[ ]*»`, 'g'), (m, i) => (i === 0 && !afterExpr && m === '»' ? m : `${NB}»`));
  s = s.replace(/(\S)[ ]+([?!;:])(?=\s|$|[»)\]"'’.,<]|&)/g, `$1${NB}$2`);
  if (afterExpr) s = s.replace(/^[ ]+([?!;:])/, `${NB}$1`);

  // Nombre et unité : 49 €, 45 %.
  s = s.replace(/(\d)[ ]?€/g, `$1${NB}€`).replace(/(\d)[ ]%/g, `$1${NB}%`);
  if (afterExpr) s = s.replace(/^[ ]?€/, `${NB}€`).replace(/^[ ]%/, `${NB}%`);
  return s.split(NB).join(WRITTEN);
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return `${calleeName(expr.expression)}.${expr.name.text}`;
  return '';
}

/** Le texte de ce nœud s'affiche-t-il ? */
function displayed(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return false;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && SKIP_CALLEES.test(calleeName(p.expression))) return false;
    if (ts.isJsxAttribute(p)) return !SKIP_ATTRS.test(p.name.getText());
    if (ts.isPropertyAssignment(p) && p.name === node) return false;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return false;
    if (ts.isCaseClause(p)) return false;
    if (ts.isBlock(p) || ts.isSourceFile(p)) break;
  }
  return true;
}

/** Texte d'un gabarit entier, sans ses expressions. */
function templateText(node) {
  const tpl = ts.isTemplateHead(node) ? node.parent : node.parent.parent;
  return [tpl.head.text, ...tpl.templateSpans.map((span) => span.literal.text)].join(' ');
}

/** Les morceaux de texte d'un fichier. Pour une chaîne ou un gabarit, `prose` :
 *  l'ensemble est-il du texte (et non un filtre, une adresse, du balisage) ? */
function pieces(sf) {
  const out = [];
  const visit = (node) => {
    const add = (start, end, kind, opts = {}, prose = true) => {
      if (end > start && displayed(node)) out.push({ start, end, kind, opts, prose });
    };
    if (ts.isJsxText(node)) {
      const siblings = node.parent.children ?? [];
      const i = siblings.indexOf(node);
      add(node.pos, node.end, 'jsx', { afterExpr: i > 0 && ts.isJsxExpression(siblings[i - 1]) });
    } else if (ts.isStringLiteral(node)) {
      if (ts.isJsxAttribute(node.parent)) add(node.getStart(sf) + 1, node.end - 1, 'jsx');
      else add(node.getStart(sf) + 1, node.end - 1, 'js', {}, PROSE.test(node.text));
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node.getStart(sf) + 1, node.end - 1, 'js', {}, PROSE.test(node.text));
    } else if (ts.isTemplateHead(node)) {
      add(node.getStart(sf) + 1, node.end - 2, 'js', {}, PROSE.test(templateText(node)));
    } else if (ts.isTemplateMiddle(node)) {
      add(node.getStart(sf) + 1, node.end - 2, 'js', { afterExpr: true }, PROSE.test(templateText(node)));
    } else if (ts.isTemplateTail(node)) {
      add(node.getStart(sf) + 1, node.end - 1, 'js', { afterExpr: true }, PROSE.test(templateText(node)));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !SKIP_FILES.some((re) => re.test(p)) ? [p] : [];
  });
}

/** Corrections à faire, fichier par fichier. */
export function typoEdits(root = SRC) {
  const result = [];
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const edits = [];
    for (const { start, end, kind, opts, prose } of pieces(sf)) {
      const raw = text.slice(start, end);
      // Chaîne de code (filtre `%${q}%`, adresse, balisage) : seulement l'unité
      // après un nombre (« ${prix} € »), jamais le reste.
      if (!prose && !(opts.afterExpr && /^[ ]?€|^[ ]%/.test(raw))) continue;
      const fixed = prose ? fixText(raw, kind, opts) : raw.replace(/^[ ]?€/, '\\u00a0€').replace(/^[ ]%/, '\\u00a0%');
      if (fixed !== raw) edits.push({ start, end, raw, fixed, line: sf.getLineAndCharacterOfPosition(start).line + 1 });
    }
    if (edits.length) result.push({ file: relative(ROOT, file), text, edits });
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = typoEdits();
  if (process.argv.includes('--check')) {
    for (const { file, edits } of all) for (const e of edits) console.log(`${file}:${e.line}\n  - ${e.raw.trim()}\n  + ${e.fixed.trim()}`);
    const n = all.reduce((sum, f) => sum + f.edits.length, 0);
    console.log(n ? `✗ ${n} morceau(x) de texte à corriger : node scripts/typo-fr.mjs` : '✓ typographie à jour');
    process.exit(n ? 1 : 0);
  }
  for (const { file, text, edits } of all) {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.fixed + out.slice(e.end);
    writeFileSync(join(ROOT, file), out);
  }
  console.log(`✓ ${all.reduce((sum, f) => sum + f.edits.length, 0)} morceau(x) corrigé(s) dans ${all.length} fichier(s)`);
}
