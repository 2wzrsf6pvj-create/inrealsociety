// E2E avec base — accessibilité, dans un vrai navigateur. axe-core (le moteur
// des outils d'audit) passe sur les écrans du passant, du porteur et de
// /admin : aucune erreur WCAG 2.2 A ou AA, ni écart aux bonnes pratiques. Puis
// ce qu'axe ne voit pas : clavier, focus, annonces aux lecteurs d'écran.
// Animations réduites pendant l'audit : axe lit chaque écran dans son état
// final, pas au milieu d'une apparition en fondu.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { ADMIN_EMAIL, createWearer, logIn, newContext, skipIntros, sql, type Wearer } from './support';

const AXE     = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8');
const RULES   = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'];
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const PHONE   = { width: 390, height: 844 };

/** Écarts relevés par axe sur la page affichée, un par règle : « règle (nombre
 *  d'éléments) : premier élément ». */
async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (tags) => {
    type Result = { violations: { id: string; nodes: { html: string }[] }[] };
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<Result> } }).axe;
    const { violations } = await axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return violations.map((v) => `${v.id} (${v.nodes.length}) : ${v.nodes[0]?.html.slice(0, 140)}`);
  }, RULES);
}

/** L'écran, une fois prêt (`ready` visible), ne présente aucun écart. */
async function expectAccessible(page: Page, ready: Locator, screen: string) {
  await expect(ready, `${screen} : écran affiché`).toBeVisible();
  expect(await axeViolations(page), screen).toEqual([]);
}

/** Passant : téléphone, jamais connecté ; plein soleil s'il le demande. */
async function passant(browser: Browser, { sun = false, intros = true } = {}) {
  const context = await newContext(browser, { userAgent: ANDROID, viewport: PHONE });
  if (intros) await skipIntros(context);
  if (sun) await context.addInitScript(() => { try { localStorage.setItem('irs_sun', '1'); } catch { /* sans effet */ } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { context, page };
}

/** Porteur avec une présentation, un Instagram et une conversation où c'est au
 *  passant de répondre. */
function wearerWithConversation(firstName: string): Wearer & { conversation: string } {
  const wearer = createWearer(firstName);
  sql(`UPDATE members SET pitch = 'Toujours partante pour un café.', instagram = '@camille' WHERE id = '${wearer.memberId}'`);
  const conversation = crypto.randomUUID();
  sql(`INSERT INTO messages (id, member_id, content, author, created_at)
       VALUES ('${conversation}', '${wearer.memberId}', 'On s''est croisés au marché.', 'scanner', now() - interval '1 hour')`);
  sql(`INSERT INTO messages (member_id, parent_id, content, author) VALUES ('${wearer.memberId}', '${conversation}', 'Merci ! Tu étais au stand ?', 'member')`);
  return { ...wearer, conversation };
}

test('le passant : profil, message, conversation, en mode sombre et en plein soleil', async ({ browser }) => {
  const wearer = wearerWithConversation('Camille');
  for (const sun of [false, true]) {
    const mode = sun ? ' (plein soleil)' : '';
    const { context, page } = await passant(browser, { sun });

    await page.goto(`/profil/${wearer.memberId}`);
    await expectAccessible(page, page.getByRole('link', { name: 'Lui envoyer un message' }), `profil${mode}`);
    // Prénom en capitales par le style seulement : le texte lu reste
    // « Camille », pas une suite de lettres à épeler.
    await expect(page.getByText(wearer.name.toUpperCase(), { exact: true })).toHaveCount(0);

    await page.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
    await expectAccessible(page, page.getByRole('heading', { level: 1, name: 'Un signal discret.' }), `message${mode}`);
    // Titre annoncé à l'arrivée sur la page.
    await expect(page).toHaveTitle('Envoyer un message — In Real Society');

    await page.goto(`/conversation/${wearer.conversation}`);
    await expectAccessible(page, page.getByLabel('Votre message'), `conversation${mode}`);
    // Le fil est un journal : un message qui arrive est annoncé.
    await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Merci ! Tu étais au stand ?');
    await context.close();
  }
});

test('plein soleil : le contour de focus reste visible sur le fond clair', async ({ browser }) => {
  const wearer = createWearer('Nora');
  const { context, page } = await passant(browser, { sun: true });
  await page.goto(`/profil/${wearer.memberId}`);
  const link = page.getByRole('link', { name: 'Lui envoyer un message' });
  await expect(link).toBeVisible();
  // Au clavier, jusqu'au bouton principal.
  for (let i = 0; i < 10 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  // Le lien a une transition (transition-all) : au moment du focus, le contour
  // part encore de la couleur du texte ; on attend sa couleur finale.
  await expect.poll(() => link.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgba(0, 0, 0, 0.75)');
  await context.close();
});

test('après l’envoi, le focus va sur « Signal envoyé. » : un lecteur d’écran l’annonce', async ({ browser }) => {
  const wearer = createWearer('Lina');
  const { context, page } = await passant(browser);
  await page.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
  await page.getByLabel('Message libre').fill('Belle audace, ce t-shirt.');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).focus();
  await page.keyboard.press('Enter');
  const title = page.getByRole('heading', { level: 1, name: 'Signal envoyé.' });
  await expect(title).toBeFocused();
  await expectAccessible(page, title, 'message envoyé');
  await context.close();
});

test('premier passage : le bandeau des cookies est une zone nommée', async ({ browser }) => {
  const { context, page } = await passant(browser, { intros: false });
  await page.goto('/faq');
  await expectAccessible(page, page.getByRole('region', { name: 'Cookies' }), 'bandeau cookies');
  await context.close();
});

test('boutique : le guide des tailles s’ouvre en fenêtre, Échap le ferme et rend le focus', async ({ browser }) => {
  const { context, page } = await passant(browser);
  await page.goto('/shop');
  const trigger = page.getByRole('button', { name: 'Guide des tailles' });
  await expectAccessible(page, trigger, 'boutique');

  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Guide des tailles' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fermer le guide des tailles' })).toBeFocused();
  expect(await axeViolations(page), 'guide des tailles').toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await context.close();
});

test('le porteur : « Mon espace », sa conversation, et le lien « Mon espace » nommé comme affiché', async ({ browser }) => {
  const wearer = wearerWithConversation('Hugo');
  // Deux scans cette semaine : les chiffres de l'accueil s'affichent.
  sql(`INSERT INTO scans (member_id, scanned_at) VALUES ('${wearer.memberId}', now() - interval '1 hour'), ('${wearer.memberId}', now() - interval '2 days')`);
  sql(`UPDATE members SET scan_count = 2 WHERE id = '${wearer.memberId}'`);
  const context = await newContext(browser, { viewport: PHONE });
  await logIn(context, wearer);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/dashboard');
  await expectAccessible(page, page.getByRole('heading', { level: 1, name: new RegExp(`^Bienvenue\\s*${wearer.name}\\.$`) }), 'mon espace (accueil)');
  // Les chiffres se lisent comme des phrases, avec leur valeur finale.
  await expect(page.getByText('2 scans au total')).toBeAttached();
  await expect(page.getByText('2 scans ces 7 derniers jours')).toBeAttached();
  await page.goto('/dashboard?tab=inbox');
  await expectAccessible(page, page.getByRole('tab', { name: /Messages/, selected: true }), 'mon espace (messages)');
  await page.goto('/dashboard?tab=settings');
  await expectAccessible(page, page.getByRole('tab', { name: 'Réglages', selected: true }), 'mon espace (réglages)');

  await page.goto(`/conversation/${wearer.conversation}`);
  await expectAccessible(page, page.getByRole('heading', { level: 1, name: 'Conversation' }), 'conversation (porteur)');
  // Commande vocale : « Mon espace » trouve le lien qui affiche « Mon espace ».
  await expect(page.getByRole('navigation', { name: 'Compte' }).getByRole('link', { name: 'Mon espace' })).toBeVisible();
  await context.close();
});

test('présentation de « Mon espace » : une fenêtre, le focus y reste, Échap équivaut à « Passer »', async ({ browser }) => {
  const wearer = createWearer('Sacha');
  const context = await newContext(browser, { viewport: PHONE });
  await logIn(context, wearer);
  await context.addInitScript(() => { try { localStorage.removeItem('irs_onboarding_v1'); } catch { /* sans effet */ } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');

  const dialog = page.getByRole('dialog', { name: new RegExp(`^Bienvenue,\\s*${wearer.name}\\.$`) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Suivant' })).toBeFocused();
  expect(await axeViolations(page), 'présentation').toEqual([]);

  // Le focus ne passe jamais derrière la fenêtre : le reste de la page est
  // inerte. Après le dernier bouton, il sort vers le navigateur (plus rien de
  // focalisé dans la page), puis revient dans la fenêtre.
  const visited: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    visited.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return '(navigateur)';
      return el.closest('dialog') ? (el.textContent ?? '').trim() : `DERRIÈRE : ${(el.textContent ?? el.tagName).trim().slice(0, 40)}`;
    }));
  }
  expect(visited.filter((name) => name.startsWith('DERRIÈRE')), visited.join(' → ')).toEqual([]);
  expect(visited).toContain('Passer');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Le drapeau est écrit à l'événement « close », que le navigateur déclenche
  // juste après avoir fermé la fenêtre (tâche suivante).
  await expect.poll(() => page.evaluate(() => localStorage.getItem('irs_onboarding_v1'))).toBe('1');
  await context.close();
});

test('/admin', async ({ browser }) => {
  const wearer = createWearer('Alex');
  const context = await newContext(browser);
  await logIn(context, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/admin?q=${wearer.name}`);
  await expectAccessible(page, page.getByRole('heading', { name: 'Notifications' }), 'admin');
  await context.close();
});
