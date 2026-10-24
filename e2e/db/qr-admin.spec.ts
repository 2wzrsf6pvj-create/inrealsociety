// E2E avec base — « Voir le QR » dans /admin (demande de Clément : tester de A
// à Z ; en mode test, rien n'est imprimé). Le QR affiché se lit, comme par
// l'appareil photo d'un téléphone, et un passant qui le suit arrive sur le
// profil du porteur.

import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { ADMIN_EMAIL, APP_URL, createWearer, logIn, newContext } from './support';

test('/admin → « Voir le QR » : le QR se lit et mène au profil du porteur', async ({ browser }) => {
  const wearer = createWearer('Ivy');
  const url = `${APP_URL}/r/${wearer.shortCode}`;

  const admin = await newContext(browser);
  await logIn(admin, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const page = await admin.newPage();
  await page.goto(`/admin?q=${encodeURIComponent(wearer.name)}#recherche`);
  const card = page.locator('#recherche').locator('div').filter({ hasText: wearer.email }).last();
  await card.getByText('Voir le QR').click();
  const img = card.getByRole('img', { name: `QR de ${wearer.name}` });
  await expect(img).toBeVisible();
  await expect(card).toContainText(url);

  // Lu à la taille affichée, sur l'écran blanc.
  const src = (await img.getAttribute('src'))!;
  const svg = Buffer.from(src.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  const png = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: 240 }, font: { loadSystemFonts: false } }).render();
  expect(jsQR(new Uint8ClampedArray(png.pixels), png.width, png.height)?.data).toBe(url);

  // Un passant, sans session, suit le QR.
  const passerby = await newContext(browser);
  const p = await passerby.newPage();
  await p.goto(url);
  await expect(p).toHaveURL(new RegExp(`/profil/${wearer.memberId}`));
  await expect(p.getByText(wearer.name).first()).toBeVisible();
  await passerby.close();
  await admin.close();
});
