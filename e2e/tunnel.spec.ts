// E2E tunnel achat → activation → premier scan.
//
// Ces tests valident le chemin critique business du projet en exécution
// réelle, contrairement aux smoke tests de public-pages.spec.ts qui ne
// vérifient que le rendu HTTP 200.
//
// Pré-requis pour faire tourner (sinon : test.skip automatique) :
//   TEST_E2E_FULL=1
//   NEXT_PUBLIC_SUPABASE_URL=<test project>
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<test anon>
//   SUPABASE_SERVICE_ROLE_KEY=<test service role>
//   STRIPE_SECRET_KEY=sk_test_...
//   STRIPE_PRICE_ID=price_test_...
//   STRIPE_WEBHOOK_SECRET=whsec_test_...
//   RESEND_API_KEY=re_test_...  (ou laisser vide → email skip silencieux)
//   PRINTFUL_API_TOKEN=...        (sandbox mode)
//
// Pour lancer :
//   TEST_E2E_FULL=1 npm run test:e2e
//
// Note : ces tests utilisent Stripe Test Mode + cartes de test (4242 4242 4242 4242).
// La validation finale du tunnel se fait en :
//   1. Vérifiant que /api/health retourne 200
//   2. Posant un achat via /shop avec carte test
//   3. Vérifiant que la webhook crée l'order en 'paid' + génère le code
//   4. Activant le code via /register
//   5. Vérifiant la création du membre en DB
//   6. Vérifiant que le fulfillment Printful est déclenché (sandbox)
//   7. Vérifiant qu'un scan via /api/scan incrémente scan_count

import { test, expect } from '@playwright/test';

const FULL = process.env.TEST_E2E_FULL === '1';

test.describe('Tunnel achat → activation → premier scan', () => {
  test.skip(!FULL, 'TEST_E2E_FULL=1 requis (Stripe test mode + Supabase test)');

  test('health endpoint répond 200 avec checks OK', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks.supabase).toBe('ok');
  });

  test('shop : formulaire d\'achat soumet vers Stripe Checkout', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.getByText(/^49\s€$/).first()).toBeVisible();

    // Remplit email + sélectionne taille/couleur (defaults M + dark)
    const testEmail = `test-${Date.now()}@example.com`;
    await page.locator('input[type="email"]').first().fill(testEmail);

    // Submit (le bouton redirige vers Stripe — on attend l'URL Stripe)
    const checkoutBtn = page.locator('button[type="submit"]').first();
    const [response] = await Promise.all([
      page.waitForResponse('**/api/shop/checkout'),
      checkoutBtn.click(),
    ]);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  // TODO — étapes suivantes du tunnel à implémenter :
  //
  //   test('webhook Stripe crée order + code activation') : utiliser Stripe CLI
  //     pour forward un event checkout.session.completed signé, puis query DB
  //     pour vérifier orders.status = 'paid' et activation_code != null
  //
  //   test('register avec code crée le membre') : POST /api/activate avec le
  //     code, créer compte via Supabase Auth, POST /api/member/create,
  //     vérifier que members.auth_user_id est set
  //
  //   test('fulfillment Printful déclenché') : vérifier orders.printful_order_id
  //     != null après création du membre (en sandbox Printful)
  //
  //   test('scan incrémente scan_count') : POST /api/scan avec memberId,
  //     vérifier scans.length === 1 et members.scan_count === 1
  //
  // Ces étapes nécessitent un setup Supabase de test isolé et la capacité
  // de purger la DB entre les runs — pas en scope pour cette session.
});

test.describe('Health (toujours en place sans TEST_E2E_FULL)', () => {
  // Ce test tourne même sans Stripe/Supabase parce qu'il vérifie juste que
  // l'endpoint health existe et retourne un JSON valide (status peut être 503
  // si Supabase pas configuré — c'est précisément ce qu'on veut signaler).
  test('GET /api/health retourne JSON structuré', async ({ request }) => {
    const res = await request.get('/api/health');
    const body = await res.json();
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('timestamp');
  });
});
