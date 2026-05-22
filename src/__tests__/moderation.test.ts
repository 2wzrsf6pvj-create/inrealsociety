// Tests de la modération de contenu.
// Vérifie le chemin OpenAI happy path, le fallback regex sur erreur, et le
// fallback sans clé. Le but est de couvrir les chemins de bug réels :
//  - un appel OpenAI HTTP 5xx → on doit retomber sur le regex, pas crasher
//  - une erreur réseau → idem
//  - pas de clé → comportement historique (regex pur)
//
// Les fetch sont stubés via vi.stubGlobal, l'env var via vi.stubEnv.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { moderateContent } from '@/lib/moderation';

describe('moderateContent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('Sans OPENAI_API_KEY (fallback regex)', () => {
    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', '');
    });

    it('flag les mots bannis', async () => {
      const result = await moderateContent('tu es une salope');
      expect(result.flagged).toBe(true);
      expect(result.source).toBe('regex');
      expect(result.categories).toEqual([]);
    });

    it('passe les messages neutres', async () => {
      const result = await moderateContent('Bonjour, comment vas-tu ?');
      expect(result.flagged).toBe(false);
      expect(result.source).toBe('regex');
    });

    it('normalise les accents avant la comparaison', async () => {
      // "salope" avec accent aigu sur le 'o' (forme contournement)
      const result = await moderateContent('salópe');
      expect(result.flagged).toBe(true);
    });

    it('est insensible à la casse', async () => {
      const result = await moderateContent('SALOPE EN MAJUSCULES');
      expect(result.flagged).toBe(true);
    });

    // ─── Régression : matching par frontière de mot (\b…s?\b) ───────────────
    // Avant, le matching en substring bloquait des mots parfaitement légitimes.
    describe('frontière de mot — ne bloque PAS les mots légitimes', () => {
      const legit = [
        "j'aime ta technique",     // 'nique'
        'la culture française',    // 'cul'
        'une robe violette',       // 'viol'
        'du fromage râpé',         // 'rape' (après dé-accentuation)
        'on va se retrouver',      // 'retrouver' (cœur du produit) — volontairement retiré
        'donne-moi ton adresse',   // 'adresse' — retiré
        'je vais te suivre sur insta', // 'suivre' — retiré
        "c'est unique",            // 'nique'
        'mort de rire',            // 'mort' — retiré
        'un baiser sur la joue',   // 'baiser' — retiré
        'situer le lieu',          // 'tuer'
        'poursuivre la discussion',// 'suivre'
        'la statue',               // 'tue'
      ];
      for (const phrase of legit) {
        it(`laisse passer « ${phrase} »`, async () => {
          expect((await moderateContent(phrase)).flagged).toBe(false);
        });
      }
    });

    describe('frontière de mot — bloque bien les abus (mots entiers + pluriels)', () => {
      const abuse = [
        'va te faire niquer',  // niquer
        'je vais te tuer',     // tuer
        'espèce de connard',   // connard
        'fdp',                 // abréviation
        'ta gueule tg',        // abréviation
        'sale viol',           // viol entier
        'des salopes',         // pluriel
      ];
      for (const phrase of abuse) {
        it(`bloque « ${phrase} »`, async () => {
          expect((await moderateContent(phrase)).flagged).toBe(true);
        });
      }
    });
  });

  describe('Avec OPENAI_API_KEY', () => {
    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');
    });

    it('appelle OpenAI et retourne source=openai en cas de succès', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{
            flagged:    true,
            categories: { harassment: true, hate: false, sexual: true },
          }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await moderateContent('contenu offensant');
      expect(result.flagged).toBe(true);
      expect(result.source).toBe('openai');
      expect(result.categories).toContain('harassment');
      expect(result.categories).toContain('sexual');
      expect(result.categories).not.toContain('hate');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/moderations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Authorization': 'Bearer sk-test-key' }),
        }),
      );
    });

    it('retourne flagged=false si OpenAI dit non flagged', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ flagged: false, categories: {} }] }),
      }));

      const result = await moderateContent('message neutre');
      expect(result.flagged).toBe(false);
      expect(result.source).toBe('openai');
    });

    it('retombe sur regex si OpenAI renvoie HTTP 5xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok:     false,
        status: 500,
      }));

      const result = await moderateContent('salope');
      expect(result.flagged).toBe(true);             // attrapé par le regex fallback
      expect(result.source).toBe('regex_fallback');
    });

    it('retombe sur regex si fetch lance une exception (timeout, DNS, etc.)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network failure')));

      const result = await moderateContent('contenu propre');
      expect(result.flagged).toBe(false);
      expect(result.source).toBe('regex_fallback');
    });

    it('retombe sur regex si la réponse JSON est mal formée', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok:   true,
        json: async () => ({}), // pas de results
      }));

      const result = await moderateContent('hello');
      expect(result.source).toBe('regex_fallback');
    });
  });
});
