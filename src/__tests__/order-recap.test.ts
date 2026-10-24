// Récapitulatif de commande : page de confirmation et email d'activation.

import { describe, it, expect } from 'vitest';
import { buildOrderRecap, formatEuros } from '@/lib/order-recap';
import { emailActivation } from '@/lib/email-templates';

const ADDRESS = { name: 'Jeanne Test', address1: '1 rue de Rivoli', zip: '75001', city: 'Paris', country_code: 'FR' };
const FULL = { color: 'dark', size: 'L', taglineId: 'un-message-une-chance', totalCents: 4900, shippingCents: 0, address: ADDRESS };

describe('formatEuros', () => {
  it('formate des centimes en euros, à la française', () => {
    expect(formatEuros(5900)).toMatch(/^59,00\s€$/);
    expect(formatEuros(500)).toMatch(/^5,00\s€$/);
  });
});

describe('buildOrderRecap', () => {
  it('commande complète : article, accroche, livraison, total, adresse', () => {
    const r = buildOrderRecap(FULL);
    expect(r.article).toBe('T-shirt Noir · L');
    expect(r.tagline).toBe('Un message ? Une chance.');
    expect(r.shipping).toBe('Comprise');
    expect(r.total).toMatch(/^49,00\s€$/);
    expect(r.address).toBe('Jeanne Test, 1 rue de Rivoli, 75001 Paris, France');
  });

  it('un port payé (commande passée avant la livraison comprise) est affiché en euros', () => {
    const base = { color: 'light', size: 'M', taglineId: null };
    expect(buildOrderRecap({ ...base, shippingCents: 500 }).shipping).toMatch(/^5,00\s€$/);
    expect(buildOrderRecap({ ...base, shippingCents: 1200 }).shipping).toMatch(/^12,00\s€$/);
  });

  it('QR seul, taille invalide ignorée, données absentes à null', () => {
    expect(buildOrderRecap({ color: 'light', size: 'XXXL', taglineId: null })).toEqual({
      article: 'T-shirt Blanc', tagline: null, shipping: null, total: null, address: null,
    });
  });

  it('accroche hors bibliothèque → QR seul (jamais de texte arbitraire)', () => {
    expect(buildOrderRecap({ color: 'dark', size: 'S', taglineId: 'texte-libre' }).tagline).toBeNull();
  });
});

describe('emailActivation : récapitulatif', () => {
  const mail = (recap?: ReturnType<typeof buildOrderRecap>) =>
    emailActivation({ code: 'ABCD2345', registerUrl: 'https://example.com/register?code=ABCD2345', recap }).html;

  it('liste la commande et renvoie aux CGV', () => {
    const html = mail(buildOrderRecap(FULL));
    expect(html).toContain('Votre commande');
    expect(html).toContain('T-shirt Noir · L');
    expect(html).toContain('« Un message ? Une chance. »');
    expect(html).toMatch(/Livraison[\s\S]*Comprise/);
    // Franchise de TVA : le total payé, sans « TTC ».
    expect(html).toMatch(/Total payé[\s\S]*49,00\s€/);
    expect(html).not.toContain('TTC');
    expect(html).toContain('1 rue de Rivoli');
    expect(html).toContain('/cgv');
  });

  it("échappe l'adresse saisie chez Stripe", () => {
    const html = mail(buildOrderRecap({ ...FULL, address: { ...ADDRESS, name: '<img src=x onerror=alert(1)>' } }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('sans récapitulatif (renvoi du code) : pas de bloc commande', () => {
    expect(mail()).not.toContain('Votre commande');
  });
});
