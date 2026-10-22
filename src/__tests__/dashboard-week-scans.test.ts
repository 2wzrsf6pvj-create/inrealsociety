// Compteur « 7 jours » de l'accueil du porteur : un vrai décompte en base. Avant,
// il comptait parmi les 5 scans chargés pour la liste « Derniers scans » et
// plafonnait donc à 5, alors que le graphique premium affichait le vrai total.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { scanWindowStart, getScanCountSince } from '@/lib/queries-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

describe('scanWindowStart', () => {
  it('minuit (UTC) du premier des 7 jours affichés, aujourd’hui compris', () => {
    expect(scanWindowStart(7, new Date('2026-10-22T15:30:00Z'))).toBe('2026-10-16T00:00:00.000Z');
  });
});

describe('getScanCountSince', () => {
  it('compte en base, sans plafond, depuis le début de la fenêtre du graphique', async () => {
    const calls: unknown[][] = [];
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: (...a: unknown[]) => { calls.push(['select', ...a]); return {
        eq: (...b: unknown[]) => { calls.push(['eq', ...b]); return {
          gte: (...c: unknown[]) => { calls.push(['gte', ...c]); return Promise.resolve({ count: 27, error: null }); },
        }; },
      }; },
    });

    expect(await getScanCountSince('m-1', 7)).toBe(27);
    expect(calls[0]).toEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(calls[2]).toEqual(['gte', 'scanned_at', scanWindowStart(7)]);
  });
});
