// E2E avec base — premium offert aux testeurs (choix de Clément) : depuis
// /admin → « Suivi des porteurs », 4 semaines, puis retour au gratuit, seul. Le
// testeur le voit dans ses réglages, sans abonnement à gérer ni paiement.

import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, createWearer, logIn, newContext, sql } from './support';

const PHONE = { width: 390, height: 844 };
const SHORT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });
const LONG  = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

test('/admin offre le premium 4 semaines à un testeur, qui le voit dans ses réglages ; arrêt possible', async ({ browser }) => {
  const wearer = createWearer('Noa');
  const until = () => new Date(Number(sql(`SELECT extract(epoch FROM plan_expires_at) * 1000 FROM members WHERE id = '${wearer.memberId}'`)));

  const adminContext = await newContext(browser);
  await logIn(adminContext, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const a = await adminContext.newPage();
  a.on('dialog', (dialog) => dialog.accept());   // « Offrir le premium 4 semaines ? »
  const card = () => a.locator('#suivi').locator('div').filter({ hasText: wearer.name }).last();

  await test.step('offrir, depuis le suivi : la date de fin s’affiche', async () => {
    await a.goto('/admin#suivi');
    await card().getByRole('button', { name: 'Offrir le premium 4 semaines' }).click();
    await expect(card().getByRole('status')).toBeVisible();
    const end = until();
    expect(end.getTime() - Date.now()).toBeGreaterThan(27.9 * 86_400_000);
    await expect(card().getByRole('status')).toHaveText(`Fait. Premium offert jusqu’au ${LONG.format(end)}.`);
    await a.reload();
    await expect(card()).toContainText(`premium offert jusqu’au ${SHORT.format(end)}`);
    await expect(card().getByRole('button', { name: 'Arrêter le premium offert' })).toBeVisible();
  });

  const wearerContext = await newContext(browser, { viewport: PHONE });
  await logIn(wearerContext, wearer);
  const w = await wearerContext.newPage();

  await test.step('le testeur : premium offert jusqu’à la date, rien à payer ni à résilier', async () => {
    await w.goto('/dashboard?tab=settings');
    await expect(w.getByText(`Premium offert jusqu’au ${LONG.format(until())} : rien à payer, il s’arrête seul à cette date.`)).toBeVisible();
    await expect(w.getByRole('button', { name: /abonnement/ })).toHaveCount(0);
    await expect(w.getByRole('button', { name: /Passer premium/ })).toHaveCount(0);
  });

  await test.step('arrêter avant la date : retour au gratuit', async () => {
    await card().getByRole('button', { name: 'Arrêter le premium offert' }).click();
    await expect(card().getByRole('status')).toHaveText('Fait.');
    expect(sql(`SELECT plan || '|' || (plan_expires_at IS NULL) FROM members WHERE id = '${wearer.memberId}'`)).toBe('free|true');
    await w.reload();
    await expect(w.getByRole('button', { name: /Passer premium/ })).toBeVisible();
  });

  await wearerContext.close();
  await adminContext.close();
});
