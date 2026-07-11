// La bibliothèque d'accroches et ses tracés pré-cuits doivent rester cohérents :
// chaque accroche a un tracé vectoriel valide, la whitelist refuse l'arbitraire, et
// les slugs sont uniques (un slug figé sur des commandes passées ne doit pas dériver).

import { describe, it, expect } from 'vitest';
import { TAGLINES, isValidTaglineId, getTagline, TAGLINE_NONE, taglinesByRegistre, TAGLINE_LANGS } from '@/lib/taglines';
import { BAKED_TAGLINES } from '@/lib/taglines.generated';

describe('bibliothèque d’accroches', () => {
  it('des ids uniques (un slug est figé sur les commandes passées)', () => {
    const ids = TAGLINES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chaque accroche a un tracé vectoriel pré-cuit, non vide, sans NaN', () => {
    for (const t of TAGLINES) {
      const baked = BAKED_TAGLINES[t.id];
      expect(baked, `tracé manquant pour ${t.id} — lancer bake-taglines`).toBeTruthy();
      expect(baked.path.length).toBeGreaterThan(0);
      expect(baked.path.includes('NaN')).toBe(false);
      expect(baked.bbox.x2).toBeGreaterThan(baked.bbox.x1);
    }
  });

  it('la whitelist refuse tout id hors bibliothèque (pas de texte arbitraire imprimé)', () => {
    expect(isValidTaglineId(TAGLINES[0].id)).toBe(true);
    expect(isValidTaglineId('<script>')).toBe(false);
    expect(isValidTaglineId('')).toBe(false);
    expect(isValidTaglineId('nexiste-pas')).toBe(false);
  });

  it('getTagline : id valide → objet ; null/inconnu → null', () => {
    expect(getTagline(TAGLINES[0].id)?.id).toBe(TAGLINES[0].id);
    expect(getTagline(TAGLINE_NONE)).toBeNull();
    expect(getTagline('nope')).toBeNull();
  });

  it('les deux langues (fr, en) ont des accroches', () => {
    for (const lang of TAGLINE_LANGS) {
      expect(TAGLINES.some((t) => t.lang === lang), `aucune accroche ${lang}`).toBe(true);
    }
  });

  it('taglinesByRegistre(lang) ne renvoie QUE la langue demandée', () => {
    for (const lang of TAGLINE_LANGS) {
      const groups = taglinesByRegistre(lang);
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) {
        expect(g.items.length).toBeGreaterThan(0);           // pas de registre vide
        expect(g.items.every((t) => t.lang === lang)).toBe(true);
      }
    }
  });
});
