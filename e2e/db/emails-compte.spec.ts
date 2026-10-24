// E2E avec base — emails de compte à J0 : la confirmation d'adresse ouverte
// dans un autre navigateur que celui de l'inscription (l'app Gmail, par
// exemple). Avec notre modèle d'email (lien vers /auth/confirm), la session
// s'ouvre là où le lien est ouvert, et /register retrouve le code d'activation
// gardé sur le compte : le profil se crée sans rien ressaisir.

import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { GATEWAY_URL, newContext, skipIntros, sql } from './support';

const PHONE = { width: 390, height: 844 };

test('confirmation ouverte dans un autre navigateur : le code revient seul, le profil se crée', async ({ browser }) => {
  const tag = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
  const code = `M${tag}`;
  const email = `confirme-${tag.toLowerCase()}@example.com`;
  sql(`INSERT INTO activation_codes (code, used) VALUES ('${code}', false)`);

  await test.step('inscription, dans le navigateur du téléphone', async () => {
    const context = await newContext(browser, { viewport: PHONE });
    await skipIntros(context);
    const page = await context.newPage();
    await page.goto(`/register?code=${code}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/Mot de passe/).fill('un-mot-de-passe-solide');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByText(/il vous ramène ici pour finaliser votre profil/)).toBeVisible();
    await context.close();
  });

  // Le code est gardé sur le compte ; Supabase envoie le lien (simulé ici).
  const signup = await (await fetch(`${GATEWAY_URL}/auth-test/signup?email=${encodeURIComponent(email)}`)).json();
  expect(signup.metadata).toEqual({ activation_code: code });
  sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${signup.id}', '${email}', now())`);

  await test.step('le lien ouvert ailleurs, sans session : le code revient seul, le profil se crée', async () => {
    const context = await newContext(browser, { viewport: PHONE });
    await skipIntros(context);
    const page = await context.newPage();
    await page.goto(`/auth/confirm?token_hash=${signup.tokenHash}&type=email&next=/register`);
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByLabel('Code d’activation')).toHaveValue(code);

    await page.getByLabel('Prénom ou pseudo').fill(`Lina${tag}`);
    await page.getByLabel(/Qui êtes-vous/).fill('Quelqu’un qui aime les rencontres.');
    await page.getByLabel(/Que cherchez-vous à provoquer/).fill('Une conversation.');
    await page.getByLabel(/Votre phrase de fin/).fill('À bientôt, en vrai.');
    await page.getByLabel(/18 ans ou plus/).check();
    await page.getByLabel(/J.accepte les/).check();
    await page.getByRole('button', { name: 'Activer mon vêtement' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await context.close();
  });

  expect(sql(`SELECT count(*) FROM members WHERE auth_user_id = '${signup.id}'`)).toBe('1');
  expect(sql(`SELECT used FROM activation_codes WHERE code = '${code}'`)).toBe('t');
});
