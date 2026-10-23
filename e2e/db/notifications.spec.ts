// E2E avec base — mesure des notifications (#36), dans un vrai navigateur :
// l'app construite comme en production, la vraie base de test, une session
// simulée (cf. e2e/db/README.md).

import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, createWearer, logIn, newContext, sql } from './support';

const IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID    = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const PHONE      = { width: 390, height: 844 };

/** « téléphone | app installée » relevés pour ce porteur. */
const phoneOf = (memberId: string) =>
  sql(`SELECT coalesce(phone_os, '-') || '|' || (app_installed_at IS NOT NULL) FROM members WHERE id = '${memberId}'`);

test('« Mon espace » ouvert depuis l’app sur iPhone : téléphone et première ouverture relevés', async ({ browser }) => {
  const wearer = createWearer('Lou');
  const context = await newContext(browser, { userAgent: IPHONE_APP, viewport: PHONE });
  await logIn(context, wearer);
  const page = await context.newPage();

  await page.goto('/dashboard?src=app');
  await expect(page.getByText(`${wearer.name}.`)).toBeVisible();
  await expect.poll(() => phoneOf(wearer.memberId)).toBe('ios|true');
  await context.close();
});

test('depuis un ordinateur : rien n’est relevé', async ({ browser }) => {
  const wearer = createWearer('Hugo');
  const context = await newContext(browser);
  await logIn(context, wearer);
  const page = await context.newPage();

  await page.goto('/dashboard?src=app');
  await expect(page.getByText(`${wearer.name}.`)).toBeVisible();
  // Le relevé s'écrit après la page : on lui laisse le temps d'arriver.
  await page.waitForTimeout(1500);
  expect(phoneOf(wearer.memberId)).toBe('-|false');
  await context.close();
});

test('app installée depuis une autre page du site : « / » mène à « Mon espace », qui la reconnaît', async ({ browser }) => {
  const wearer = createWearer('Nora');
  const context = await newContext(browser, { userAgent: ANDROID, viewport: PHONE });
  await logIn(context, wearer);
  const page = await context.newPage();

  await page.goto('/?src=app');
  await expect(page).toHaveURL(/\/dashboard\?src=app$/);
  await expect(page.getByText(`${wearer.name}.`)).toBeVisible();
  await expect.poll(() => phoneOf(wearer.memberId)).toBe('android|true');
  await context.close();
});

test('/admin : bloc « Notifications », et fiche du porteur dans la recherche', async ({ browser }) => {
  const wearer = createWearer('Ines');
  sql(`UPDATE members SET phone_os = 'ios', app_installed_at = now() - interval '2 days' WHERE id = '${wearer.memberId}'`);
  sql(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, member_id)
       VALUES ('https://web.push.apple.com/e2e-${wearer.memberId}', 'p', 'a', '${wearer.memberId}')`);
  const context = await newContext(browser);
  await logIn(context, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const page = await context.newPage();

  await page.goto(`/admin?q=${wearer.name}`);
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  for (const label of ['Porteurs prévenus', 'iPhone : app installée', 'Android : prévenus', 'Passants qui suivent la réponse']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  const card = page.locator('#recherche');
  await expect(card.locator('p', { hasText: 'Notifications :' })).toHaveText('Notifications : activées · Apple');
  await expect(card.locator('p', { hasText: 'Téléphone :' })).toContainText('iPhone · app installée, première ouverture le');
  await context.close();
});

test('déconnexion : l’appareil n’est plus abonné, côté serveur comme côté navigateur', async ({ browser }) => {
  const wearer = createWearer('Sam');
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${wearer.memberId}`;
  sql(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, member_id) VALUES ('${endpoint}', 'p', 'a', '${wearer.memberId}')`);
  const context = await newContext(browser, { userAgent: ANDROID, viewport: PHONE });
  await logIn(context, wearer);
  let unsubscribed = false;
  await context.exposeFunction('e2eUnsubscribed', () => { unsubscribed = true; });
  // Le Chromium de test n'a pas de service de push : l'abonnement de cet
  // appareil est simulé. Le serveur et la base, eux, sont réels.
  await context.addInitScript((endpoint) => {
    const subscription = {
      endpoint,
      unsubscribe: async () => { await (window as unknown as { e2eUnsubscribed: () => Promise<void> }).e2eUnsubscribed(); return true; },
      toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
    };
    const registration = { pushManager: { getSubscription: async () => subscription } };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  }, endpoint);
  const page = await context.newPage();

  await page.goto('/dashboard?tab=settings');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(sql(`SELECT count(*) FROM push_subscriptions WHERE endpoint = '${endpoint}'`)).toBe('0');
  expect(unsubscribed).toBe(true);
  await context.close();
});
