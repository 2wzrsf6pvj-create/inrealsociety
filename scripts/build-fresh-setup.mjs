// scripts/build-fresh-setup.mjs
// Régénère scripts/fresh-setup.sql : concaténation VERBATIM de toutes les migrations
// de supabase/migrations/, dans l'ordre qui marche sur une base neuve.
//
//   node scripts/build-fresh-setup.mjs           → réécrit scripts/fresh-setup.sql
//   node scripts/build-fresh-setup.mjs --check   → exit 1 si le fichier est périmé
//
// Ordre : 015 (schéma) EN PREMIER, puis le reste en ordre numérique — 001-014 posent
// la RLS sur des tables créées en 015. Le test fresh-setup-sync.test.ts échoue si on
// ajoute une migration sans relancer ce script.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT           = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const OUTPUT         = join(ROOT, 'scripts', 'fresh-setup.sql');
const SCHEMA_FIRST   = '015_schema_complet.sql';
const BAR            = '-- ' + '═'.repeat(63);

export function orderedMigrations(dir = MIGRATIONS_DIR) {
  const files = readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  return [SCHEMA_FIRST, ...files.filter(f => f !== SCHEMA_FIRST)];
}

export function buildFreshSetup(dir = MIGRATIONS_DIR) {
  const files = orderedMigrations(dir);
  const last  = files.map(f => f.slice(0, 3)).sort().at(-1);
  const header = [
    '-- fresh-setup.sql — INSTALLATION D\'UNE BASE NEUVE (Option A)',
    `-- GÉNÉRÉ par scripts/build-fresh-setup.mjs (${files.length} migrations) — ne pas éditer à la main.`,
    '-- Ordre CORRIGÉ : 015 (schéma) EN PREMIER — 001-014 posent la RLS sur des tables',
    `-- créées en 015, donc un ordre 001→${last} naïf échoue ("table members n'existe pas").`,
    '--',
    '-- USAGE : projet Supabase NEUF (auth + storage + rôles anon/authenticated/service_role',
    '-- déjà présents). Coller TOUT dans le SQL Editor → Run. IF NOT EXISTS partout.',
    '',
  ].join('\n');
  const sections = files.map(f => {
    const body = readFileSync(join(dir, f), 'utf8').trimEnd();
    return `\n\n${BAR}\n-- ▶ ${f}\n${BAR}\n${body}\n`;
  });
  return header + sections.join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = buildFreshSetup();
  if (process.argv.includes('--check')) {
    const current = readFileSync(OUTPUT, 'utf8');
    if (current !== next) {
      console.error('✗ scripts/fresh-setup.sql est périmé — lancer : node scripts/build-fresh-setup.mjs');
      process.exit(1);
    }
    console.log('✓ scripts/fresh-setup.sql à jour');
  } else {
    writeFileSync(OUTPUT, next);
    console.log(`✓ scripts/fresh-setup.sql régénéré (${orderedMigrations().length} migrations)`);
  }
}
