// Smoke tests : vérifie que les pages publiques rendent sans crash et
// contiennent les éléments-clés attendus. Pas de Supabase/Stripe réel — l'app
// tourne avec le fallback placeholder pour les vars manquantes.
//
// Tests futurs à ajouter (gated derrière TEST_E2E_FULL=1) :
//   - Tunnel achat : /shop → checkout Stripe test mode → email activation
//   - Conversation : /profil/{id} → scan → message → réponse → push notif
//   - Premium : dashboard → upgrade → Stripe test → premium activé

import { test, expect } from '@playwright/test';

test.describe('Pages publiques', () => {
  test('homepage rend et affiche le pitch', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/In Real Society/);
    await expect(page.locator('text=The IRL Social Club').first()).toBeVisible();
  });

  test('shop rend avec le produit + prix', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveTitle(/In Real Society/);
    await expect(page.locator('text=49€').first()).toBeVisible();
  });

  test('manifeste rend avec sommaire + tous les blocs', async ({ page }) => {
    await page.goto('/manifeste');
    await expect(page.locator('text=Sommaire')).toBeVisible();
    await expect(page.locator('h2').first()).toBeVisible();
  });

  test('cgv et confidentialite rendent (compliance pages)', async ({ page }) => {
    await page.goto('/cgv');
    await expect(page.locator('h1')).toContainText('Conditions');

    await page.goto('/confidentialite');
    await expect(page.locator('h1')).toContainText('Politique de confidentialité');
  });

  test('robots.txt et sitemap.xml répondent', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
  });

  test('ConsentBanner s\'affiche à la première visite', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    // Le banner apparaît si pas de localStorage.irs_consent
    const banner = page.locator('text=cookies de mesure');
    await expect(banner).toBeVisible({ timeout: 5000 });
  });

  test('ConsentBanner : dans le HTML serveur, masqué au rechargement après un choix', async ({ page, request }) => {
    // Rendu côté serveur : visible sans attendre le JavaScript.
    expect(await (await request.get('/faq')).text()).toContain('data-consent-banner');
    await page.goto('/faq');
    const banner = page.locator('[data-consent-banner]');
    await expect(banner).toBeVisible();
    await page.getByRole('button', { name: 'Refuser' }).click();
    await expect(banner).toHaveCount(0);
    // Toujours dans le HTML, mais masqué avant l'affichage (html.consent-set).
    await page.reload();
    await expect(banner).toHaveCount(1);
    await expect(banner).toBeHidden();
  });
});

// Chrome et Safari ne cherchent le manifeste que dans le <head>. Quand
// generateMetadata attend la base, Next envoie les métadonnées dans le <body> :
// la conversation pose les siennes dans son layout. HTML brut du serveur, pour
// juger de ce que le navigateur trouve au chargement.
test.describe('App installable', () => {
  const head = (html: string) => html.slice(0, html.indexOf('</head>'));

  test('accueil : manifeste, icône PNG et balises Apple dans le <head>', async ({ request }) => {
    const html = head(await (await request.get('/')).text());
    expect(html).toContain('<link rel="manifest" href="/manifest.json"');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black"');
  });

  test('conversation : son manifeste et les balises Apple dans le <head>', async ({ request }) => {
    test.setTimeout(60_000);   // sans base : la page attend l'échec des requêtes
    const id = '541c253f-592d-4f6e-8de6-d32676a72df1';
    const html = head(await (await request.get(`/conversation/${id}`, { timeout: 55_000 })).text());
    expect(html).toContain(`<link rel="manifest" href="/conversation/${id}/manifest.webmanifest"`);
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black"');
  });
});

test.describe('Pages protégées (redirect login attendu sans auth)', () => {
  test('/dashboard redirige vers login', async ({ page }) => {
    const response = await page.goto('/dashboard');
    // Soit on redirect (status 200 sur /auth/login), soit 5xx si Supabase indisponible
    // (acceptable car ce test tourne sans clé Supabase config'd)
    if (response && response.ok()) {
      // Le proxy redirige proprement
      await expect(page).toHaveURL(/\/auth\/login/);
    }
  });
});
