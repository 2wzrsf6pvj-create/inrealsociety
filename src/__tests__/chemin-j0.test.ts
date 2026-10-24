// Chemin vers J0 : /admin dit ce que l'app voit de sa configuration (variables
// présentes ou manquantes, paiements réels ou de test, domaine encodé dans les
// QR imprimés), sans jamais afficher un secret.

import { describe, it, expect } from 'vitest';
import { setupStatus, PRINTFUL_VARIANTS } from '@/lib/setup-status';

const COMPLETE: Record<string, string> = {
  NEXT_PUBLIC_APP_URL:          'https://inrealsociety.com',
  SHORT_DOMAIN:                 'https://inreal.me',
  UPSTASH_REDIS_REST_URL:       'https://eu1.upstash.io',
  UPSTASH_REDIS_REST_TOKEN:     'SECRET-upstash',
  STRIPE_SECRET_KEY:            'sk_live_SECRET',
  STRIPE_PRICE_ID:              'price_1',
  STRIPE_WEBHOOK_SECRET:        'whsec_SECRET',
  STRIPE_PREMIUM_PRICE_ID:      'price_2',
  PRINTFUL_API_TOKEN:           'SECRET-printful',
  ...Object.fromEntries(PRINTFUL_VARIANTS.map((k, i) => [k, String(4000 + i)])),
  RESEND_API_KEY:               're_SECRET',
  ADMIN_ALERT_EMAIL:            'alertes@example.com',
  CRON_SECRET:                  'SECRET-cron',
  INTERNAL_SECRET:              'SECRET-internal',
  NEXT_PUBLIC_SENTRY_DSN:       'https://key@o1.ingest.sentry.io/1',
  VAPID_PUBLIC_KEY:             'BPUB',
  VAPID_PRIVATE_KEY:            'SECRET-vapid',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPUB',
};
const checks = (env: Record<string, string | undefined>, migration062 = true) =>
  setupStatus(env, { migration062 }).flatMap((g) => g.checks);
const check = (env: Record<string, string | undefined>, label: string, migration062 = true) =>
  checks(env, migration062).find((c) => c.label === label)!;

describe('configuration vue de /admin', () => {
  it('tout est en place : rien à régler, paiements réels', () => {
    expect(checks(COMPLETE).filter((c) => !c.ok)).toEqual([]);
    expect(check(COMPLETE, 'Paiements').detail).toBe('réels : une commande payée part à l’impression');
    expect(check(COMPLETE, 'Domaine').detail).toBe('inrealsociety.com : liens des emails et pages des profils.');
    // Sans domaine court : le domaine principal est celui des QR.
    expect(check({ ...COMPLETE, SHORT_DOMAIN: '' }, 'Domaine').detail).toContain('https://inrealsociety.com/r/<code>');
  });

  it('jamais la valeur d’un secret', () => {
    const shown = JSON.stringify(setupStatus({ ...COMPLETE, STRIPE_PRICE_ID: '' }, { migration062: true }));
    const secrets = Object.values(COMPLETE).filter((value) => value.includes('SECRET'));
    expect(secrets).toHaveLength(8);
    for (const value of secrets) expect(shown).not.toContain(value);
  });

  it('paiements de test (recette) : dit que rien n’est imprimé', () => {
    const c = check({ ...COMPLETE, STRIPE_SECRET_KEY: 'sk_test_SECRET' }, 'Paiements');
    expect(c).toEqual({ label: 'Paiements', ok: true, detail: expect.stringContaining('rien n’est imprimé') });
  });

  it('domaine provisoire : à remplacer ; les QR l’encoderaient pour toujours sans domaine court', () => {
    const provisional = { ...COMPLETE, NEXT_PUBLIC_APP_URL: 'https://inrealsociety.vercel.app' };
    const c = check(provisional, 'Domaine');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('domaine provisoire, à remplacer');
    expect(check({ ...provisional, SHORT_DOMAIN: '' }, 'Domaine').detail).toContain('Les QR imprimés l\'encoderaient pour toujours');
  });

  it('domaine court des QR (choix de Clément : inreal.me) : à renseigner, et distinct du domaine principal', () => {
    expect(check(COMPLETE, 'Domaine court des QR')).toEqual({
      label: 'Domaine court des QR', ok: true, detail: expect.stringContaining('les QR encodent https://inreal.me/<code>'),
    });
    const empty = check({ ...COMPLETE, SHORT_DOMAIN: '' }, 'Domaine court des QR');
    expect(empty.ok).toBe(false);
    expect(empty.detail).toContain('portée de scan ≈ 2,0 m au lieu de 2,5 m');
    expect(check({ ...COMPLETE, SHORT_DOMAIN: 'https://inrealsociety.com' }, 'Domaine court des QR').ok).toBe(false);
    expect(check({ ...COMPLETE, SHORT_DOMAIN: 'inreal' }, 'Domaine court des QR').ok).toBe(false);
  });

  it('variantes Printful incomplètes : combien, et lesquelles', () => {
    const c = check({ ...COMPLETE, PRINTFUL_VARIANT_ID_LIGHT_XXL: '', PRINTFUL_VARIANT_ID_DARK_S: undefined }, 'Printful : tailles et couleurs');
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/^8 variantes sur 10/);
    expect(c.detail).toContain('PRINTFUL_VARIANT_ID_DARK_S, PRINTFUL_VARIANT_ID_LIGHT_XXL');
  });

  it('variables manquantes : nommées, avec ce qu’elles empêchent', () => {
    const c = check({ ...COMPLETE, VAPID_PRIVATE_KEY: '' }, 'Notifications');
    expect(c).toEqual({ label: 'Notifications', ok: false, detail: expect.stringContaining('manque : VAPID_PRIVATE_KEY') });
    expect(check({ ...COMPLETE, STRIPE_SECRET_KEY: undefined }, 'Paiements').ok).toBe(false);
  });

  it('notifications : la clé publique du navigateur doit être celle du serveur', () => {
    const c = check({ ...COMPLETE, NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BAUTRE' }, 'Notifications');
    expect(c).toEqual({ label: 'Notifications', ok: false, detail: expect.stringContaining('doit être identique') });
  });

  it('migration 062 absente : signalée', () => {
    expect(check(COMPLETE, 'Base', false)).toEqual({ label: 'Base', ok: false, detail: expect.stringContaining('062') });
  });
});
