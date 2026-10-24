// E2E avec base — réseau faible (4G dans la rue), dans un vrai navigateur :
// - hors ligne : le message est gardé, la page le dit, il part au retour du
//   réseau ;
// - la réponse à un envoi se perd alors que le serveur l'a bien reçu : le
//   nouvel essai ne crée pas de second message, ni dans la conversation ;
// - le texte tapé survit au rechargement de la page ;
// - une coupure pendant la connexion n'est pas « Email ou mot de passe
//   incorrect ».

import crypto from 'node:crypto';
import { test, expect, request, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { APP_URL, createWearer, newContext, skipIntros, sql } from './support';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const PHONE   = { width: 390, height: 844 };
const OFFLINE_KEPT = 'Pas de réseau pour le moment. Réessayez dès qu’il revient. Votre message est gardé.';

/** Texte unique : retrouvé sans ambiguïté dans la base. */
const unique = (text: string) => `${text} (${crypto.randomUUID().slice(0, 8)})`;

/** Passant : téléphone, jamais connecté. */
async function passant(browser: Browser) {
  const context = await newContext(browser, { userAgent: ANDROID, viewport: PHONE });
  await skipIntros(context);
  return { context, page: await context.newPage() };
}

/** Message d'erreur annoncé (role="alert"). Filtré par son texte : l'annonceur
 *  de changement de page de Next est aussi une alerte. */
const alertWith = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** Bulle d'un message dans la conversation, entre guillemets. */
const bubble = (page: Page, text: string) => page.getByText(`«\u00a0${text}\u00a0»`);

/**
 * La prochaine requête vers `url` arrive au serveur, qui la traite ; sa réponse
 * se perd en chemin (4G qui décroche) : le navigateur ne voit qu'une coupure.
 * Le serveur la reçoit avec les cookies de l'appareil, et sa réponse, cookies
 * compris, ne revient jamais au navigateur. `status` : la réponse perdue.
 */
async function loseNextResponse(page: Page, context: BrowserContext, url: string) {
  const lost = { status: 0 };
  await page.route(url, async (route) => {
    const sent = route.request();
    const cookie = (await context.cookies(APP_URL)).map((c) => `${c.name}=${c.value}`).join('; ');
    const server = await request.newContext();
    const res = await server.fetch(sent.url(), {
      method:  sent.method(),
      headers: { 'content-type': sent.headers()['content-type'] ?? 'application/json', cookie },
      data:    sent.postData() ?? undefined,
    });
    lost.status = res.status();
    await server.dispose();
    await route.abort('connectionreset');
  }, { times: 1 });
  return lost;
}

test('hors ligne : le message est gardé, la page le dit, il part au retour du réseau', async ({ browser }) => {
  const wearer = createWearer('Lou');
  const text = unique('Ton t-shirt m’a fait sourire.');
  const { context, page: p } = await passant(browser);
  await p.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
  await p.getByLabel('Message libre').fill(text);

  await context.setOffline(true);
  await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(alertWith(p, OFFLINE_KEPT)).toBeVisible();
  await expect(p.getByLabel('Message libre')).toHaveValue(text);

  await context.setOffline(false);
  await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'Signal envoyé.' })).toBeVisible();
  expect(sql(`SELECT count(*) FROM messages WHERE member_id = '${wearer.memberId}' AND content = '${text.replace(/'/g, "''")}'`)).toBe('1');
  await context.close();
});

test('la réponse au premier message se perd : le nouvel essai ne crée pas de second message', async ({ browser }) => {
  const wearer = createWearer('Noé');
  const text = unique('On s’est croisés à la gare.');
  const { context, page: p } = await passant(browser);
  await p.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
  // L'appareil est reconnu dès l'ouverture du formulaire, avant tout envoi.
  expect((await context.cookies(APP_URL)).map((c) => c.name)).toContain('irs_sender');

  const lost = await loseNextResponse(p, context, '**/api/message');
  await p.getByLabel('Message libre').fill(text);
  await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(alertWith(p, OFFLINE_KEPT)).toBeVisible();
  expect(lost.status, 'le serveur a bien reçu le message').toBe(200);

  await test.step('nouvel essai : reconnu, il mène à la conversation déjà créée', async () => {
    await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(p.getByRole('heading', { level: 1, name: /déjà lancé/ })).toBeVisible();
    expect(sql(`SELECT count(*) FROM messages WHERE member_id = '${wearer.memberId}'`)).toBe('1');
    await p.getByRole('button', { name: 'Voir la conversation' }).click();
    await expect(p).toHaveURL(/\/conversation\/[0-9a-f-]{36}$/);
    await expect(bubble(p, text)).toBeVisible();
  });

  await test.step('le profil la retrouve, comme après un envoi réussi', async () => {
    await p.goto(`/profil/${wearer.memberId}`);
    await expect(p.getByRole('link', { name: 'Retrouver votre conversation' })).toBeVisible();
  });
  await context.close();
});

test('conversation : texte gardé au rechargement ; réponse perdue, le fil la montre une fois', async ({ browser }) => {
  const wearer = createWearer('Iris');
  const answer = unique('Avec plaisir, à samedi.');
  const { context, page: p } = await passant(browser);
  await p.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
  await p.getByLabel('Message libre').fill(unique('Bonjour !'));
  await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await p.getByRole('button', { name: 'Voir la conversation' }).click();
  await expect(p).toHaveURL(/\/conversation\/[0-9a-f-]{36}$/);
  const root = new URL(p.url()).pathname.split('/').pop()!;
  // Le porteur a répondu : au passant d'écrire.
  sql(`INSERT INTO messages (member_id, parent_id, content, author) VALUES ('${wearer.memberId}', '${root}', 'Merci ! On se voit samedi ?', 'member')`);
  await p.reload();

  await test.step('le texte tapé survit au rechargement', async () => {
    await p.getByLabel('Votre message').fill(answer);
    await p.reload();
    await expect(p.getByLabel('Votre message')).toHaveValue(answer);
  });

  const lost = await loseNextResponse(p, context, '**/api/conversation/reply');
  await p.getByRole('button', { name: 'Répondre', exact: true }).click();
  await expect(alertWith(p, OFFLINE_KEPT)).toBeVisible();
  expect(lost.status, 'le serveur a bien reçu la réponse').toBe(200);

  await test.step('nouvel essai : la réponse était partie, le fil rechargé la montre', async () => {
    await p.getByRole('button', { name: 'Répondre', exact: true }).click();
    await expect(bubble(p, answer)).toBeVisible();
    // Au porteur de répondre : plus de champ, et plus de brouillon.
    await expect(p.getByLabel('Votre message')).toHaveCount(0);
    expect(await p.evaluate((key) => sessionStorage.getItem(key), `draft:reply:${root}:scanner`)).toBeNull();
    expect(sql(`SELECT count(*) FROM messages WHERE parent_id = '${root}' AND author = 'scanner'`)).toBe('1');
  });
  await context.close();
});

test('message : le brouillon s’efface une fois le message parti', async ({ browser }) => {
  const wearer = createWearer('Max');
  const { context, page: p } = await passant(browser);
  await p.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
  const text = unique('Tapé sous un tunnel.');
  await p.getByLabel('Message libre').fill(text);
  await p.reload();
  await expect(p.getByLabel('Message libre')).toHaveValue(text);
  await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'Signal envoyé.' })).toBeVisible();
  expect(await p.evaluate((key) => sessionStorage.getItem(key), `draft:message:${wearer.memberId}`)).toBeNull();
  await context.close();
});

test('connexion : une coupure réseau n’est pas « Email ou mot de passe incorrect »', async ({ browser }) => {
  const context = await newContext(browser, { viewport: PHONE });
  await skipIntros(context);
  const p = await context.newPage();
  await p.goto('/auth/login');
  await p.getByLabel('Email', { exact: true }).fill('lou@example.com');
  await p.getByLabel('Mot de passe', { exact: true }).fill('un-mot-de-passe');

  await p.route('**/auth/v1/token**', (route) => route.abort('internetdisconnected'), { times: 1 });
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await expect(alertWith(p, 'Pas de réseau pour le moment. Réessayez dès qu’il revient.')).toBeVisible();

  // Service d'authentification qui ne répond pas (502 à 504).
  await p.route('**/auth/v1/token**', (route) => route.fulfill({ status: 503, body: 'Service Unavailable' }), { times: 1 });
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await expect(alertWith(p, 'Le service ne répond pas pour le moment. Réessayez dans un instant.')).toBeVisible();
  await expect(p.getByText('Email ou mot de passe incorrect.')).toHaveCount(0);
  await context.close();
});
