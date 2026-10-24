// E2E avec base — origine d'un achat : le passant qui suit, depuis le profil
// d'un porteur, le lien vers la boutique (en bas du profil, ou « Découvrir le
// t-shirt » après son message) envoie ce porteur avec sa commande ; même s'il
// revient plus tard sur la boutique sans le lien, sur le même appareil,
// pendant 30 jours. Stripe n'est pas appelé : /api/shop/checkout répond une
// erreur simulée, seul compte ce que la boutique lui envoie. Ce que le serveur
// en fait : integration/tunnel.test.ts.

import crypto from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createWearer, newContext, skipIntros } from './support';

const PHONE = { width: 390, height: 844 };

/** Passant sur son téléphone ; la commande ne part pas chez Stripe. */
async function passant(browser: Parameters<typeof newContext>[0]) {
  const context = await newContext(browser, { viewport: PHONE });
  await skipIntros(context);
  const page = await context.newPage();
  await page.route('**/api/shop/checkout', (route) => route.fulfill({ status: 503, json: { error: 'simulé' } }));
  return { context, page };
}

/** Commande depuis la boutique ; renvoie ce que la page envoie au serveur.
 *  Le formulaire de commande, pas celui de la lettre d'information (même
 *  libellé « Votre email »). */
async function order(page: Page): Promise<Record<string, unknown>> {
  const form = page.locator('form', { has: page.getByRole('button', { name: /^Commander en/ }) });
  const sent = page.waitForRequest('**/api/shop/checkout');
  await form.getByLabel('Votre email').fill('passant@example.com');
  await form.getByLabel(/J.ai lu et j.accepte les/).check();
  await form.getByRole('button', { name: /^Commander en/ }).click();
  return (await sent).postDataJSON();
}

test('du profil à la boutique : le porteur suit la commande, 30 jours sur le même appareil', async ({ browser }) => {
  const wearer = createWearer('Origine');
  const { context, page } = await passant(browser);

  await test.step('le lien discret en bas du profil mène à la boutique', async () => {
    await page.goto(`/profil/${wearer.memberId}`);
    await page.getByRole('link', { name: 'C’est quoi ce t-shirt\u00a0?' }).click();
    await expect(page).toHaveURL(new RegExp(`/shop\\?from=${wearer.memberId}$`));
  });

  await test.step('la commande envoie ce porteur', async () => {
    expect(await order(page)).toEqual(expect.objectContaining({ fromMemberId: wearer.memberId }));
  });

  await test.step('revenu plus tard, sans le lien : toujours ce porteur', async () => {
    await page.goto('/shop');
    expect(await order(page)).toEqual(expect.objectContaining({ fromMemberId: wearer.memberId }));
  });

  await test.step('au-delà de 30 jours : plus d’origine', async () => {
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('scan_origin') ?? '{}');
      localStorage.setItem('scan_origin', JSON.stringify({ ...saved, at: saved.at - 31 * 86_400_000 }));
    });
    await page.goto('/shop');
    expect(await order(page)).not.toHaveProperty('fromMemberId');
  });
  await context.close();
});

test('après son message, « Découvrir le t-shirt » mène à la boutique avec ce porteur', async ({ browser }) => {
  const wearer = createWearer('Message');
  const { context, page } = await passant(browser);

  await page.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
  await page.getByLabel('Message libre').fill(`On s’est croisés, joli t-shirt (${crypto.randomUUID().slice(0, 8)})`);
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.getByText('Signal envoyé.')).toBeVisible();

  await page.getByRole('button', { name: 'Découvrir le t-shirt →' }).click();
  await expect(page).toHaveURL(new RegExp(`/shop\\?from=${wearer.memberId}$`));
  expect(await order(page)).toEqual(expect.objectContaining({ fromMemberId: wearer.memberId }));
  await context.close();
});
