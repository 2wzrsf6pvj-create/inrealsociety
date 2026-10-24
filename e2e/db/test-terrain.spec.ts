// E2E avec base — test terrain : ce que Clément suit dans /admin pendant les
// 4 semaines. Un porteur écrit « Votre avis » depuis « Mon espace » : l'avis
// arrive dans /admin avec son prénom ; sa fiche de suivi donne ses chiffres
// (jamais le contenu des messages) ; « Semaine par semaine » compte la semaine
// en cours.

import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, createWearer, logIn, newContext, sql } from './support';

const PHONE = { width: 390, height: 844 };

test('« Votre avis » arrive dans /admin avec le porteur ; suivi et semaine en cours à jour', async ({ browser }) => {
  const wearer = createWearer('Jade');
  // Scanné et contacté aujourd'hui, sans réponse pour l'instant.
  sql(`INSERT INTO scans (member_id) VALUES ('${wearer.memberId}')`);
  sql(`INSERT INTO messages (member_id, content, author) VALUES ('${wearer.memberId}', 'Contenu jamais affiché dans le suivi', 'scanner')`);
  const note = `Les notifications arrivent bien (${crypto.randomUUID().slice(0, 8)}).`;

  const wearerContext = await newContext(browser, { viewport: PHONE });
  await logIn(wearerContext, wearer);
  const w = await wearerContext.newPage();
  await w.goto('/dashboard?tab=settings');
  await w.getByLabel('Votre retour (bug, suggestion, impression)').fill(note);
  await w.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(w.getByText('Merci pour votre retour.')).toBeVisible();
  await wearerContext.close();

  const adminContext = await newContext(browser);
  await logIn(adminContext, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const a = await adminContext.newPage();
  await a.goto('/admin');

  await test.step('avis : le texte, et le prénom du porteur connecté', async () => {
    const avis = a.locator('#avis');
    const card = avis.locator('div').filter({ hasText: note }).last();
    await expect(card).toBeVisible();
    await expect(card.getByRole('link', { name: wearer.name })).toHaveAttribute('href', `/profil/${wearer.memberId}`);
  });

  await test.step('suivi : ses chiffres, sans le contenu des messages', async () => {
    const suivi = a.locator('#suivi');
    const card = suivi.locator('div').filter({ hasText: wearer.name }).last();
    await expect(card).toContainText('Scans : 1 · 1 ces 7 derniers jours');
    await expect(card).toContainText('Messages : 1 · 0 avec réponse');
    await expect(card).toContainText('Notifications : non activées');
    await expect(suivi).not.toContainText('Contenu jamais affiché');
    // Le prénom mène à sa fiche dans la recherche (état, suspension).
    await card.getByRole('link', { name: wearer.name }).click();
    await expect(a.locator('#recherche').getByText(wearer.email)).toBeVisible();
  });

  await test.step('semaine par semaine : la semaine en cours compte le scan et le message', async () => {
    await a.goto('/admin#chiffres');
    const table = a.getByRole('table', { name: 'Semaine par semaine, la semaine en cours d’abord' });
    const current = table.getByRole('row').filter({ hasText: 'en cours' });
    await expect(current).toHaveCount(1);
    await expect(table.getByRole('row')).toHaveCount(9);   // en-tête et 8 semaines
    // Colonnes : porteurs scannés, scans, messages, répondus. La base est
    // partagée entre les tests : au moins ce scan et ce message.
    const cells = current.getByRole('cell');
    await expect(cells).toHaveCount(4);
    expect(Number(await cells.nth(1).innerText())).toBeGreaterThanOrEqual(1);
    expect(Number(await cells.nth(2).innerText())).toBeGreaterThanOrEqual(1);
  });
  await adminContext.close();
});
