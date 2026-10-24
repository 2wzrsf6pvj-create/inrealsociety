// .env.example est la liste de toutes les clés et API de l'app (demande de
// Clément) : chaque variable lue par le code y figure, et rien d'obsolète n'y
// traîne. Avant, EMAIL_FROM manquait. Les variables posées par la plateforme ou
// réservées aux tests en sont exclues, avec leur raison.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PRINTFUL_VARIANTS } from '@/lib/setup-status';

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILES = ['next.config.mjs', 'instrumentation.ts', 'instrumentation-client.ts',
  'sentry.server.config.ts', 'sentry.edge.config.ts', 'capacitor.config.ts'];

/** Lues par le code, mais pas à mettre dans .env.example. */
const NOT_IN_EXAMPLE: Record<string, string> = {
  NODE_ENV:               'posée par Node et Next',
  NEXT_RUNTIME:           'posée par Next',
  VERCEL_ENV:             'posée par Vercel',
  NEXT_PUBLIC_VERCEL_ENV: 'posée par Vercel',
  CI:                     'posée par la CI',
  ANALYZE:                'analyse du bundle, à la demande (next.config.mjs)',
  CAPACITOR_SERVER_URL:   'app native seulement (docs/CAPACITOR.md)',
  RESEND_API_URL:         'tests E2E : emails envoyés à la passerelle locale',
  PRINTFUL_VARIANT_ID:    'ancien repli unique, remplacé par les variantes par taille',
};

/** Lues par un nom calculé (couleur × taille) : invisibles au relevé. */
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const COMPUTED = new Set([
  ...PRINTFUL_VARIANTS,
  ...['DARK', 'LIGHT'].flatMap((c) => SIZES.map((s) => `GELATO_PRODUCT_UID_${c}_${s}`)),
]);

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
    return /\.(ts|tsx|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const files = [...sources(path.join(ROOT, 'src')), ...CONFIG_FILES.map((f) => path.join(ROOT, f))];
const read = new Set(files.flatMap((f) =>
  [...fs.readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1])));
const example = new Set(
  [...fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

describe('.env.example', () => {
  it('chaque variable lue par le code y figure', () => {
    expect([...read].filter((k) => !example.has(k) && !(k in NOT_IN_EXAMPLE)).sort()).toEqual([]);
    for (const k of COMPUTED) expect(example.has(k), k).toBe(true);
  });

  it('rien d’obsolète : chaque variable y est lue par le code', () => {
    expect([...example].filter((k) => !read.has(k) && !COMPUTED.has(k)).sort()).toEqual([]);
  });

  it('les exclusions sont toujours lues par le code', () => {
    expect(Object.keys(NOT_IN_EXAMPLE).filter((k) => !read.has(k))).toEqual([]);
  });
});
