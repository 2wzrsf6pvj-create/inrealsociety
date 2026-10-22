// scripts/fresh-setup.sql (installation d'une base neuve) doit contenir TOUTES les
// migrations. Il s'était arrêté à 048 : une base neuve installée avec lui n'avait ni
// le correctif 052 (INSERT members ouvert) ni les colonnes du checkout (049/050).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildFreshSetup, orderedMigrations } from '../../scripts/build-fresh-setup.mjs';

const FRESH_SETUP = path.resolve(__dirname, '../../scripts/fresh-setup.sql');

describe('scripts/fresh-setup.sql', () => {
  it('est à jour avec supabase/migrations/ (sinon : node scripts/build-fresh-setup.mjs)', () => {
    expect(readFileSync(FRESH_SETUP, 'utf8') === buildFreshSetup()).toBe(true);
  });

  it('applique 015 (schéma) en premier, puis le reste en ordre numérique', () => {
    const files = orderedMigrations();
    expect(files[0]).toBe('015_schema_complet.sql');
    const rest = files.slice(1);
    expect(rest).toEqual([...rest].sort());
    expect(new Set(files).size).toBe(files.length);
  });
});
