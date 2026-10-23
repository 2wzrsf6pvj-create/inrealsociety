// E2E avec base — les parcours principaux, dans un vrai navigateur : le passant
// qui scanne et écrit, le porteur qui répond, les décisions de /admin. Chaque
// personne a son propre navigateur (contexte) : le passant n'est jamais
// connecté, et son appareil se reconnaît à son cookie, comme en vrai.
// Pas de temps réel (Supabase Realtime) dans la base de test : on voit les
// nouveaux messages en rechargeant la page.

import crypto from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, createWearer, emailsTo, logIn, newContext, skipIntros, sql } from './support';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const PHONE   = { width: 390, height: 844 };

/** Texte unique : retrouvé sans ambiguïté dans les pages et dans /admin. */
const unique = (text: string) => `${text} (${crypto.randomUUID().slice(0, 8)})`;

/** Passant : téléphone, jamais connecté. */
async function passant(browser: Parameters<typeof newContext>[0]) {
  const context = await newContext(browser, { userAgent: ANDROID, viewport: PHONE });
  await skipIntros(context);
  return context;
}

/** Bulle d'un message dans la conversation, entre guillemets. Le texte seul
 *  trouverait aussi le champ de saisie (React y recopie ce qu'on tape), avant
 *  même que le serveur ait accepté le message. */
const bubble = (page: Page, text: string) => page.getByText(`“${text}”`);

/** Carte d'un signalement dans /admin : le plus petit bloc qui contient son
 *  texte unique. Elle reste la même quand la décision remplace ses boutons. */
const signalement = (admin: Page, text: string) => admin.locator('div').filter({ hasText: text }).last();

/** Écrit au porteur depuis la page message. */
async function writeTo(page: Page, content: string) {
  await page.getByLabel('Message libre').fill(content);
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
}

test('du QR à la conversation : le passant écrit, le porteur répond, chacun son tour', async ({ browser }) => {
  const wearer = createWearer('Camille');
  const first  = unique('On s’est croisés au marché, ton t-shirt m’a fait sourire.');
  const reply  = unique('Merci ! Tu étais au stand des fleurs ?');
  const second = unique('Oui, celui avec les tournesols.');

  const passantContext = await passant(browser);
  const p = await passantContext.newPage();

  await test.step('le QR mène au profil', async () => {
    await p.goto(`/r/${wearer.shortCode}`);
    await expect(p).toHaveURL(new RegExp(`/profil/${wearer.memberId}$`));
    await expect(p.getByRole('link', { name: 'Lui envoyer un message' })).toBeVisible();
  });

  await test.step('le passant écrit, puis arrive sur sa conversation', async () => {
    await p.getByRole('link', { name: 'Lui envoyer un message' }).click();
    await writeTo(p, first);
    await expect(p.getByText('Signal envoyé.')).toBeVisible();
    await p.getByRole('button', { name: 'Voir la conversation' }).click();
    await expect(p).toHaveURL(/\/conversation\/[0-9a-f-]{36}$/);
    await expect(bubble(p, first)).toBeVisible();
  });
  const conversationUrl = p.url();
  // Le scan est compté (premier scan : il ouvre la fenêtre pour écrire), et le
  // porteur est prévenu par email du scan puis du message.
  await expect.poll(() => sql(`SELECT count(*) FROM scans WHERE member_id = '${wearer.memberId}'`)).toBe('1');
  await expect.poll(() => emailsTo(wearer.email)).toEqual(expect.arrayContaining([
    `${wearer.name}, quelqu'un vient de scanner votre profil.`,
    `${wearer.name}, quelqu'un vous a envoyé un signal.`,
  ]));

  const wearerContext = await newContext(browser, { viewport: PHONE });
  await logIn(wearerContext, wearer);
  const w = await wearerContext.newPage();

  await test.step('le porteur répond depuis « Mon espace »', async () => {
    await w.goto('/dashboard?tab=inbox');
    await w.getByRole('link', { name: 'Répondre', exact: true }).click();
    await expect(w).toHaveURL(conversationUrl);
    await expect(bubble(w, first)).toBeVisible();
    await expect(w.getByLabel('Votre réponse'), 'le porteur peut répondre').toBeVisible();
    await w.getByLabel('Votre réponse').fill(reply);
    await w.getByRole('button', { name: 'Répondre', exact: true }).click();
    await expect(bubble(w, reply)).toBeVisible();
  });

  await test.step('le passant lit la réponse et écrit à son tour', async () => {
    await p.reload();
    await expect(bubble(p, reply)).toBeVisible();
    await expect(p.getByLabel('Votre message'), 'le passant répond depuis son appareil').toBeVisible();
    await p.getByLabel('Votre message').fill(second);
    await p.getByRole('button', { name: 'Répondre', exact: true }).click();
    await expect(bubble(p, second)).toBeVisible();
  });

  await test.step('le porteur voit sa réponse lue, puis le nouveau message', async () => {
    await w.goto('/dashboard?tab=inbox');
    await expect(w.getByText('Lu ✓')).toBeVisible();
    await w.goto(conversationUrl);
    await expect(bubble(w, second)).toBeVisible();
  });

  await passantContext.close();
  await wearerContext.close();
});

test('/admin : un profil signalé par un passant est suspendu, plus personne ne peut lui écrire', async ({ browser }) => {
  const wearer = createWearer('Alex');
  const reason = unique('Sa présentation insulte les personnes en fauteuil.');

  const passantContext = await passant(browser);
  const p = await passantContext.newPage();
  await test.step('un passant signale le profil', async () => {
    await p.goto(`/profil/${wearer.memberId}`);
    await p.getByRole('button', { name: 'Signaler ce profil' }).click();
    await p.getByLabel('Signaler ce profil').fill(reason);
    await p.getByLabel(/de bonne foi/).check();
    await p.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(p.getByText(/Votre signalement a été transmis/)).toBeVisible();
  });

  const adminContext = await newContext(browser);
  await logIn(adminContext, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const a = await adminContext.newPage();
  await test.step('l’équipe le suspend depuis /admin, avec un motif', async () => {
    await a.goto('/admin');
    const card = signalement(a, reason);
    await card.getByRole('button', { name: 'Suspendre le profil' }).click();
    await card.getByLabel('Motif, envoyé au porteur avec la décision').fill('Présentation insultante (CGV, article 9).');
    await card.getByRole('button', { name: 'Suspendre le profil' }).click();
    await expect(card.getByRole('status')).toContainText('Fait. Porteur prévenu par email.');
  });
  expect(sql(`SELECT (suspended_at IS NOT NULL) || '|' || is_paused FROM members WHERE id = '${wearer.memberId}'`)).toBe('true|true');
  expect(await emailsTo(wearer.email)).toContain('Votre profil In Real Society est suspendu');

  await test.step('le QR ne mène plus qu’à « indisponible »', async () => {
    await p.goto(`/r/${wearer.shortCode}`);
    await expect(p.getByText('Ce membre est indisponible.')).toBeVisible();
    await expect(p.getByRole('link', { name: 'Lui envoyer un message' })).toHaveCount(0);
  });

  await passantContext.close();
  await adminContext.close();
});

test('messages signalés : l’équipe bannit l’appareil, qui ne peut plus écrire à personne', async ({ browser }) => {
  const wearer = createWearer('Hugo');
  const other  = createWearer('Lina');
  const abusive = unique('Réponds-moi ou je viens te chercher.');

  const passantContext = await passant(browser);
  const p = await passantContext.newPage();
  await test.step('le passant écrit au porteur', async () => {
    await p.goto(`/message?to=${wearer.memberId}&name=${wearer.name}`);
    await writeTo(p, abusive);
    await expect(p.getByText('Signal envoyé.')).toBeVisible();
  });

  const wearerContext = await newContext(browser, { viewport: PHONE });
  await logIn(wearerContext, wearer);
  const w = await wearerContext.newPage();
  await test.step('le porteur le signale depuis « Mon espace »', async () => {
    await w.goto('/dashboard?tab=inbox');
    await w.getByRole('button', { name: 'Signaler', exact: true }).click();
    await w.getByRole('button', { name: 'Confirmer', exact: true }).click();
    await expect(w.getByText('Signalé', { exact: true })).toBeVisible();
  });

  const adminContext = await newContext(browser);
  await logIn(adminContext, { id: crypto.randomUUID(), email: ADMIN_EMAIL });
  const a = await adminContext.newPage();
  await test.step('l’équipe bannit l’appareil depuis /admin', async () => {
    await a.goto('/admin');
    const card = signalement(a, abusive);
    await card.getByRole('button', { name: 'Bannir l’appareil' }).click();
    await card.getByLabel('Motif, gardé dans le journal').fill('Menace (CGV, article 9).');
    await card.getByRole('button', { name: 'Bannir l’appareil' }).click();
    await expect(card.getByRole('status')).toContainText('Fait.');
  });

  await test.step('le même appareil ne peut plus écrire, même à un autre porteur', async () => {
    await p.goto(`/message?to=${other.memberId}&name=${other.name}`);
    await writeTo(p, unique('Salut.'));
    await expect(p.getByText('Vous ne pouvez plus écrire.')).toBeVisible();
  });
  expect(sql(`SELECT count(*) FROM messages WHERE member_id = '${other.memberId}'`)).toBe('0');

  await passantContext.close();
  await wearerContext.close();
  await adminContext.close();
});
