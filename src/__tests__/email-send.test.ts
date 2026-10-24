// Délivrabilité (choix de Clément, 2026-10-22) :
// - un refus de Resend est noté avec sa raison ; avant, sendEmail renvoyait
//   false sans rien dire, et cinq appelants attendaient une exception ;
// - débit (429 rate_limit_exceeded) et panne (5xx) se réessaient, avec la même
//   clé d'idempotence : jamais de doublon ; un quota épuisé, non ; un essai sans
//   réponse abandonne à son délai (réseau faible, 2026-10-24) ;
// - les réponses vont à hello@ (Reply-To), l'expéditeur est un sous-domaine ;
// - la newsletter part par lots (une requête pour 100 emails) ;
// - les liens écrits par un passant ou un porteur sont masqués dans les emails.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendEmail, sendEmailBatch, SEND_ATTEMPTS, BATCH_MAX,
  emailNouveauMessage, emailReponse, emailNouveauScan,
} from '@/lib/email-templates';
import { maskLinks, LINK_PLACEHOLDER } from '@/lib/mask-links';
import { CONTACT_EMAIL } from '@/lib/constants';

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

type Call = { url: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null };
const calls: Call[] = [];
let replies: Array<Response | Error> = [];

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

beforeEach(() => {
  sentry.captureMessage.mockClear();
  calls.length = 0;
  replies = [];
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)), signal: init.signal });
    const next = replies.shift() ?? json(200, { id: 'e_1' });
    if (next instanceof Error) throw next;
    return next;
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Laisse passer les attentes entre deux essais. */
async function settle<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

const EMAIL = { to: 'camille@example.com', subject: 'Sujet', html: '<p>Bonjour</p>' };
const logged = () => (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n');

describe('sendEmail', () => {
  it('expéditeur en sous-domaine, réponses vers hello@, clé d’idempotence', async () => {
    expect(await settle(sendEmail(EMAIL))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].body).toMatchObject({
      from:     'In Real Society <noreply@mail.inrealsociety.com>',
      to:       ['camille@example.com'],
      reply_to: CONTACT_EMAIL,
    });
    expect(calls[0].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('débit dépassé (429) : réessaie après le délai demandé, même clé, un seul envoi', async () => {
    replies = [json(429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { 'retry-after': '1' })];
    expect(await settle(sendEmail(EMAIL))).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers['Idempotency-Key']).toBe(calls[0].headers['Idempotency-Key']);
  });

  it('Resend qui ne répond pas : l’essai abandonne à son délai, le suivant reprend la même clé', async () => {
    replies = [new DOMException('The operation was aborted due to timeout', 'TimeoutError')];
    expect(await settle(sendEmail(EMAIL))).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.signal instanceof AbortSignal)).toBe(true);
    expect(calls[1].headers['Idempotency-Key']).toBe(calls[0].headers['Idempotency-Key']);
  });

  it('Resend en panne (5xx) puis injoignable : réessaie, puis abandonne en notant la raison', async () => {
    replies = [json(500, { name: 'internal_server_error' }), new Error('ECONNRESET'), json(503, { name: 'application_error' })];
    expect(await settle(sendEmail(EMAIL))).toBe(false);
    expect(calls).toHaveLength(SEND_ATTEMPTS);
    expect(logged()).toContain(`échec après ${SEND_ATTEMPTS} essais`);
    expect(logged()).toContain('503 application_error');
  });

  it.each([
    [429, 'daily_quota_exceeded'],
    [429, 'monthly_quota_exceeded'],
    [403, 'validation_error'],
    [422, 'validation_error'],
  ])('%i %s : pas de nouvel essai, raison notée', async (status, name) => {
    replies = [json(status, { name, message: 'refus' })];
    expect(await settle(sendEmail(EMAIL))).toBe(false);
    expect(calls).toHaveLength(1);
    expect(logged()).toContain(`${status} ${name} refus`);
  });

  it('refus signalé à Sentry, regroupé par raison, sans adresse', async () => {
    replies = [json(403, { name: 'validation_error', message: 'You can only send testing emails to your own email address (moi@exemple.fr).' })];
    await settle(sendEmail(EMAIL));
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, options] = sentry.captureMessage.mock.calls[0];
    expect(message).toBe('Resend : validation_error');
    expect(options.fingerprint).toEqual(['resend', 'validation_error']);
    expect(options.extra.reason).toContain('([email])');
    expect(JSON.stringify(options)).not.toContain('@');
  });

  it('quota épuisé sur plusieurs emails : un seul problème Sentry (même empreinte)', async () => {
    replies = [json(429, { name: 'daily_quota_exceeded' }), json(429, { name: 'daily_quota_exceeded' })];
    await settle(sendEmail(EMAIL));
    await settle(sendEmail(EMAIL));
    const prints = sentry.captureMessage.mock.calls.map((c) => c[1].fingerprint.join('/'));
    expect(prints).toEqual(['resend/daily_quota_exceeded', 'resend/daily_quota_exceeded']);
  });

  it('ne lève jamais d’exception, même Resend injoignable à chaque essai', async () => {
    replies = [new Error('a'), new Error('b'), new Error('c')];
    expect(await settle(sendEmail(EMAIL))).toBe(false);
    expect(logged()).toContain('Resend injoignable : c');
  });
});

describe('sendEmailBatch', () => {
  const batch = ['a@x.fr', 'b@x.fr', 'c@x.fr'].map((to) => ({
    ...EMAIL, to, headers: { 'List-Unsubscribe': `<https://app/u?e=${to}>` },
  }));

  it('une requête pour tout le lot, validation permissive : les refusés sont comptés et notés', async () => {
    replies = [json(200, { data: [{ id: '1' }, { id: '3' }], errors: [{ index: 1, message: 'invalid to' }] })];
    expect(await settle(sendEmailBatch(batch))).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails/batch');
    expect(calls[0].headers['x-batch-validation']).toBe('permissive');
    const sent = calls[0].body as Array<Record<string, unknown>>;
    expect(sent.map((e) => e.to)).toEqual([['a@x.fr'], ['b@x.fr'], ['c@x.fr']]);
    expect(sent[2]).toMatchObject({ reply_to: CONTACT_EMAIL, headers: { 'List-Unsubscribe': '<https://app/u?e=c@x.fr>' } });
    expect(logged()).toContain('email n°1 refusé : invalid to');
  });

  it('lot refusé en entier : 0', async () => {
    replies = [json(429, { name: 'daily_quota_exceeded' })];
    expect(await settle(sendEmailBatch(batch))).toBe(0);
  });

  it(`plus de ${BATCH_MAX} emails : refusé avant tout envoi`, async () => {
    const big = Array.from({ length: BATCH_MAX + 1 }, () => EMAIL);
    await expect(sendEmailBatch(big)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('liens écrits par un passant ou un porteur', () => {
  it.each([
    ['Regarde https://evil.example/promo ici', `Regarde ${LINK_PLACEHOLDER} ici`],
    ['http://a.io', LINK_PLACEHOLDER],
    ['www.monsite.fr', LINK_PLACEHOLDER],
    ['Mon insta : instagram.com/camille', `Mon insta : ${LINK_PLACEHOLDER}`],
    ['bit.ly/3abc', LINK_PLACEHOLDER],
    ['Va sur PROMO.XYZ vite', `Va sur ${LINK_PLACEHOLDER} vite`],
  ])('« %s » → masqué', (text, expected) => {
    expect(maskLinks(text)).toBe(expected);
  });

  it.each([
    'Écris-moi : camille@gmail.com',
    'Salut.Tu es où ?',
    'Merci M.Dupont',
    '@camille.dupont sur insta',
    'On se voit à 18h30.Bisous',
    'Il fait 3.5 degrés',
  ])('« %s » → inchangé', (text) => {
    expect(maskLinks(text)).toBe(text);
  });

  it('email au porteur : message et contact masqués, réponse par le bouton rappelée', () => {
    const { html } = emailNouveauMessage({
      memberName: 'Camille', content: 'Clique sur www.arnaque.fr', senderContact: 'arnaque.fr/x',
      senderName: 'Léo', conversationUrl: 'https://app/c/1',
    });
    expect(html).not.toContain('arnaque');
    expect(html).toContain(LINK_PLACEHOLDER);
    expect(html).toContain("répondre à cet email écrit à l'équipe In Real Society");
  });

  it('email au passant : réponse du porteur masquée de même', () => {
    const { html } = emailReponse({ memberName: 'Camille', reply: 'Voici https://x.co/a', convUrl: 'https://app/c/1' });
    expect(html).not.toContain('x.co');
    expect(html).toContain('Pour répondre à Camille');
  });
});

describe('email de scan', () => {
  it('porte le lien qui le coupe', () => {
    const { html } = emailNouveauScan({
      memberName: 'Camille', dashboardUrl: 'https://app/d', unsubscribeUrl: 'https://app/api/scan-emails/unsubscribe?m=1&t=2',
    });
    expect(html).toContain('href="https://app/api/scan-emails/unsubscribe?m=1&amp;t=2"');
    expect(html).toContain('Ne plus recevoir ces emails');
  });

  it('sans lien (secret serveur absent) : part quand même, sans lien', () => {
    const { html } = emailNouveauScan({ memberName: 'Camille', dashboardUrl: 'https://app/d' });
    expect(html).not.toContain('Ne plus recevoir');
  });
});
