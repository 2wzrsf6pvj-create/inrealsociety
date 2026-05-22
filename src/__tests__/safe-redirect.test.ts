// Garde anti open-redirect — primitive de sécurité, source unique pour
// /auth/login (?redirect=) et /auth/callback (?next=). On verrouille les
// vecteurs classiques.

import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/safe-redirect';

describe('safeInternalPath', () => {
  it('accepte les chemins internes', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard');
    expect(safeInternalPath('/register?code=ABC123')).toBe('/register?code=ABC123');
    expect(safeInternalPath('/profil/abc')).toBe('/profil/abc');
  });

  it('retombe sur le fallback si vide/null', () => {
    expect(safeInternalPath(null)).toBe('/dashboard');
    expect(safeInternalPath('')).toBe('/dashboard');
    expect(safeInternalPath(null, '/x')).toBe('/x');
  });

  it('rejette les open redirects', () => {
    const vectors = [
      'https://evil.com',
      'http://evil.com/x',
      '//evil.com',            // protocol-relative
      '/\\evil.com',           // backslash normalisé en //
      'javascript:alert(1)',   // schéma
      '/redirect:evil',        // /xxx: piégeux
      'mailto:x@y.z',
      ' https://evil.com',     // espace de tête
      '\t/evil',               // contrôle de tête → check origin/startsWith
      '\n/evil',
      '\\/evil.com',           // backslash de tête (normalisé)
      'https:/evil.com',
      'http:evil.com',
    ];
    for (const v of vectors) {
      expect(safeInternalPath(v)).toBe('/dashboard');
    }
  });
});
