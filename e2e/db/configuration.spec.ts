// E2E avec base — chemin vers J0 : /admin → « Configuration » dit ce que l'app
// voit de sa configuration (variables manquantes, paiements, domaine des QR),
// avec un bandeau en tête de page, et jamais la valeur d'un secret.

import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, APP_ENV, logIn, newContext } from './support';

test('/admin → Configuration : ce qui reste à régler, sans aucun secret', async ({ browser }) => {
  const context = await newContext(browser);
  await logIn(context, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const page = await context.newPage();
  await page.goto('/admin');

  // Environnement de test : pas de Stripe, domaine local.
  await expect(page.getByText(/^Configuration : \d+ points? à régler/)).toBeVisible();
  const section = page.locator('#configuration');
  await expect(section).toContainText('Paiements : STRIPE_SECRET_KEY manquante');
  await expect(section).toContainText('Domaine : localhost:3100 : domaine provisoire');
  await expect(section).toContainText('Emails : Resend configuré');

  const html = await page.content();
  for (const secret of [APP_ENV.SUPABASE_SERVICE_ROLE_KEY, APP_ENV.INTERNAL_SECRET, APP_ENV.RESEND_API_KEY]) {
    expect(html).not.toContain(secret);
  }
  await context.close();
});
