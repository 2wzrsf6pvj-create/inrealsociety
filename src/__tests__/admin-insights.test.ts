// /admin, pilotage : chiffres du test terrain, commandes à surveiller,
// recherche littérale. Calculs purs, dates fixes.

import { describe, it, expect } from 'vitest';
import { computeFieldStats } from '@/lib/field-stats';
import { classifyOrders, cleanQuery, type WatchedOrder } from '@/lib/order-watch';

const NOW = new Date('2026-10-23T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const member = (id: string, days: number, plan = 'free') =>
  ({ id, created_at: daysAgo(days), plan, name: id, short_code: null, is_paused: false, suspended_at: null,
     stripe_subscription_id: plan === 'premium' ? `sub_${id}` : null, plan_expires_at: null });

describe('computeFieldStats', () => {
  const members = [
    member('recent', 5),            // trop récent pour le premier scan
    member('a', 20, 'premium'),     // scanné au 3e jour
    member('b', 40),                // jamais scanné dans ses 14 jours
    member('c', 200),               // ancien : hors premier scan, encore porté
  ];
  const scans = [
    { member_id: 'a', scanned_at: daysAgo(17) },
    { member_id: 'b', scanned_at: daysAgo(10) },   // 30e jour après activation : pas un premier scan, mais encore porté
    { member_id: 'c', scanned_at: daysAgo(3) },
    { member_id: 'c', scanned_at: daysAgo(45) },   // hors fenêtre de 30 jours
  ];
  const stats = computeFieldStats({
    members, scans,
    roots: [
      { id: 'm1', member_id: 'a', created_at: daysAgo(2) },
      { id: 'm2', member_id: 'a', created_at: daysAgo(12) },
      { id: 'm3', member_id: 'b', created_at: daysAgo(29) },
      { id: 'm0', member_id: 'b', created_at: daysAgo(31) },   // hors fenêtre de 30 jours
    ],
    replyParents: ['m1', 'm1', 'm3', 'm0', 'ailleurs', null],
    paidOrders:   4,
    subscriptions: [],
    phones:       null,
  }, NOW);

  it('porteurs, nouveaux, premium, commandes', () => {
    expect(stats).toEqual(expect.objectContaining({ wearers: 4, newWearers: 2, premium: 1, paidOrders: 4 }));
  });

  it('premier scan : porteurs activés il y a 14 à 120 jours, scannés dans leurs 14 premiers jours', () => {
    expect(stats.firstScan).toEqual({ eligible: 2, hit: 1 });   // a oui, b non
  });

  it('encore porté : activés depuis plus de 30 jours, scannés ces 14 derniers jours', () => {
    expect(stats.stillWorn).toEqual({ eligible: 2, hit: 2 });   // b et c
  });

  it('scans → messages → réponses sur 30 jours (une réponse compte une conversation une fois)', () => {
    expect(stats.funnel).toEqual({ scans: 3, messages: 3, replied: 2 });
  });
});

describe('classifyOrders', () => {
  const order = (over: Partial<WatchedOrder>): WatchedOrder => ({
    id: 'o', email: 'a@example.com', createdAt: daysAgo(10), status: 'paid',
    color: 'dark', size: 'M', code: 'CODE1234', codeUsed: false, printed: true, ...over,
  });

  it('payée et pas imprimée depuis plus d’une heure : à surveiller ; plus récente : pas encore', () => {
    const late  = order({ id: 'late', printed: false, createdAt: daysAgo(1) });
    const fresh = order({ id: 'fresh', printed: false, createdAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() });
    expect(classifyOrders([late, fresh], NOW, true).unprinted.map((o) => o.id)).toEqual(['late']);
  });

  it('impression à l’activation : seule une commande activée doit être imprimée', () => {
    const waiting   = order({ id: 'waiting', printed: false });
    const activated = order({ id: 'activated', printed: false, codeUsed: true });
    expect(classifyOrders([waiting, activated], NOW, false).unprinted.map((o) => o.id)).toEqual(['activated']);
  });

  it('code pas utilisé après 7 jours : à relancer ; utilisé, récent ou remboursé : non', () => {
    const list = classifyOrders([
      order({ id: 'old' }),
      order({ id: 'used', codeUsed: true }),
      order({ id: 'recent', createdAt: daysAgo(3) }),
      order({ id: 'refunded', status: 'refunded' }),
    ], NOW, true);
    expect(list.notActivated.map((o) => o.id)).toEqual(['old']);
  });
});

describe('cleanQuery', () => {
  it('retire les caractères génériques et l’échappement, borne la longueur', () => {
    expect(cleanQuery('  ca%mi*lle\\ ')).toBe('camille');
    expect(cleanQuery('x'.repeat(150))).toHaveLength(100);
    expect(cleanQuery('jean_dupont@example.com')).toBe('jean_dupont@example.com');
  });
});
