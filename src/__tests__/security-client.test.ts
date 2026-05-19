// src/__tests__/security-client.test.ts
// Tests structurels — vérifie que les composants client ne violent pas
// les règles de séparation client/serveur.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '..');

/** Récupère récursivement tous les .tsx dans src/app/ */
function getAllTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...getAllTsxFiles(full));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

function getRelativePath(filePath: string): string {
  return path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
}

const appFiles = getAllTsxFiles(path.join(SRC_DIR, 'app'));

describe('Séparation client/serveur', () => {

  describe('Composants "use client" ne doivent pas importer supabase-admin', () => {
    for (const file of appFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes("'use client'")) continue;

      const relPath = getRelativePath(file);

      it(`${relPath} — pas d'import supabase-admin`, () => {
        expect(content).not.toContain('supabase-admin');
      });

      it(`${relPath} — pas d'import require-auth`, () => {
        expect(content).not.toContain('require-auth');
      });
    }
  });

  describe('supabase.ts ne doit exporter que des lectures', () => {
    it('ne devrait pas contenir de .insert()', () => {
      const content = fs.readFileSync(path.join(SRC_DIR, 'lib/supabase.ts'), 'utf-8');
      expect(content).not.toMatch(/\.insert\(/);
    });

    it('ne devrait pas contenir de .update()', () => {
      const content = fs.readFileSync(path.join(SRC_DIR, 'lib/supabase.ts'), 'utf-8');
      expect(content).not.toMatch(/\.update\(/);
    });

    it('ne devrait pas contenir de .delete()', () => {
      const content = fs.readFileSync(path.join(SRC_DIR, 'lib/supabase.ts'), 'utf-8');
      expect(content).not.toMatch(/\.delete\(/);
    });

    it('ne devrait pas contenir de .upsert()', () => {
      const content = fs.readFileSync(path.join(SRC_DIR, 'lib/supabase.ts'), 'utf-8');
      expect(content).not.toMatch(/\.upsert\(/);
    });
  });
});

describe('Pas de secrets dans le code source', () => {
  for (const file of appFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = getRelativePath(file);

    it(`${relPath} — pas de clé API hardcodée`, () => {
      // Vérifie qu'aucun pattern de secret n'est hardcodé
      expect(content).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
      expect(content).not.toMatch(/sk_test_[a-zA-Z0-9]{20,}/);
      expect(content).not.toMatch(/whsec_[a-zA-Z0-9]{20,}/);
      expect(content).not.toMatch(/re_[a-zA-Z0-9]{20,}/);
      expect(content).not.toMatch(/eyJhbGciOi[a-zA-Z0-9+/=]{50,}/); // JWT
    });
  }
});

describe('Middleware — routes protégées', () => {
  it('le dashboard ne doit PAS être dans PUBLIC_PAGE_PREFIXES', () => {
    const middleware = fs.readFileSync(
      path.join(SRC_DIR, 'middleware.ts'), 'utf-8'
    );
    const prefixBlock = middleware.match(/PUBLIC_PAGE_PREFIXES\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
    expect(prefixBlock).not.toContain('/dashboard');
  });

  it('/api/checkout ne doit PAS être dans PUBLIC_API_PREFIXES', () => {
    const middleware = fs.readFileSync(
      path.join(SRC_DIR, 'middleware.ts'), 'utf-8'
    );
    const prefixBlock = middleware.match(/PUBLIC_API_PREFIXES\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
    expect(prefixBlock).not.toContain('/api/checkout');
  });

  it('/api/referral ne doit PAS être dans PUBLIC_API_PREFIXES', () => {
    const middleware = fs.readFileSync(
      path.join(SRC_DIR, 'middleware.ts'), 'utf-8'
    );
    const prefixBlock = middleware.match(/PUBLIC_API_PREFIXES\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
    expect(prefixBlock).not.toContain('/api/referral');
  });
});
