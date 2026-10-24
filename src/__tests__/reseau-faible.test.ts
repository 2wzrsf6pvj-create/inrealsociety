// Réseau faible (4G dans la rue), choix de Clément :
// - un envoi échoué dit pourquoi, en français (« Load failed », « Failed to
//   fetch » ou « Unexpected token… » s'affichaient tels quels), et rappelle que
//   le texte tapé est gardé ; une coupure à la connexion n'est plus « Email ou
//   mot de passe incorrect » ;
// - le jeton de l'appareil est posé dès l'ouverture du formulaire de message :
//   si la réponse au premier envoi se perd, le nouvel essai est reconnu au lieu
//   de créer un second message ;
// - un service de push qui ne répond pas ne retient pas la fonction.
// Notifications après la réponse : api-message-contract et
// conversation-reply-notify ; délai par essai chez Resend : email-send.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authFailureMessage, FAILURE_MESSAGES, isOffline, offlineMessage, requestErrorMessage,
  requestFailure, SEND_TIMEOUT_MS, timeoutSignal,
} from '@/lib/request';

const push = vi.hoisted(() => ({
  sendNotification: vi.fn().mockResolvedValue({}),
  setVapidDetails:  vi.fn(),
}));
vi.mock('web-push', () => ({ default: push }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: async () => ({
    data: [{ endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' }],
  }) }) }) },
}));
// Visiteur non connecté, pour le proxy.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

afterEach(() => { vi.unstubAllGlobals(); });

describe('envoi échoué : un message clair, jamais le texte du navigateur', () => {
  it.each([
    ['délai dépassé', new DOMException('signal timed out', 'TimeoutError'), 'timeout'],
    ['envoi interrompu', new DOMException('The operation was aborted.', 'AbortError'), 'timeout'],
    ['réseau coupé (Chrome)', new TypeError('Failed to fetch'), 'offline'],
    ['réseau coupé (Safari)', new TypeError('Load failed'), 'offline'],
    ['page d’erreur au lieu du JSON', new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON'), 'unreadable'],
    ['erreur du serveur', new Error('Ce membre est indisponible.'), null],
  ])('%s → %s', (_case, err, failure) => {
    expect(requestFailure(err)).toBe(failure);
  });

  it('échec réseau : sa nature, puis le texte gardé', () => {
    expect(requestErrorMessage(new TypeError('Load failed'), 'Erreur serveur.', 'Votre message est gardé.'))
      .toBe('Pas de réseau pour le moment. Réessayez dès qu’il revient. Votre message est gardé.');
    expect(requestErrorMessage(new DOMException('signal timed out', 'TimeoutError'), 'Erreur.'))
      .toBe(FAILURE_MESSAGES.timeout);
    expect(requestErrorMessage(new SyntaxError('Unexpected token'), 'Erreur.')).toBe(FAILURE_MESSAGES.unreadable);
  });

  it('erreur du serveur, déjà en français : telle quelle ; sans message : celui par défaut', () => {
    expect(requestErrorMessage(new Error('Trop de messages envoyés.'), 'Erreur.', 'Votre message est gardé.'))
      .toBe('Trop de messages envoyés.');
    expect(requestErrorMessage(new Error(''), 'Erreur.')).toBe('Erreur.');
    expect(requestErrorMessage('inattendu', 'Erreur.')).toBe('Erreur.');
  });

  it('hors ligne d’après le téléphone : dit avant même d’essayer', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isOffline()).toBe(true);
    expect(offlineMessage('Vos réponses sont gardées.'))
      .toBe('Pas de réseau pour le moment. Réessayez dès qu’il revient. Vos réponses sont gardées.');
    vi.stubGlobal('navigator', { onLine: true });
    expect(isOffline()).toBe(false);
  });

  it('délai d’abandon : un signal, sauf sur un navigateur trop ancien (envoi sans délai, comme avant)', () => {
    expect(timeoutSignal(SEND_TIMEOUT_MS)).toBeInstanceOf(AbortSignal);
    vi.stubGlobal('AbortSignal', class {});
    expect(timeoutSignal(SEND_TIMEOUT_MS)).toBeUndefined();
  });

  it('connexion, inscription : une coupure réseau n’est pas une erreur d’identifiants', () => {
    expect(authFailureMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(FAILURE_MESSAGES.offline);
    expect(authFailureMessage({ name: 'AuthRetryableFetchError', status: 503 })).toBe(FAILURE_MESSAGES.unreadable);
    expect(authFailureMessage({ name: 'AuthApiError', status: 400 })).toBeNull();
  });
});

describe('proxy — jeton de l’appareil posé dès le formulaire de message', () => {
  let proxy: (req: NextRequest) => Promise<Response>;
  const ID = '541c253f-592d-4f6e-8de6-d32676a72df1';
  const deviceCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('irs_sender='));
  const visit = (path: string, cookie?: string) =>
    proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));

  beforeAll(async () => {
    // Comme en production : sans ces variables, le proxy s'arrête plus tôt.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    proxy = (await import('@/proxy')).proxy;
  });
  afterAll(() => { vi.unstubAllEnvs(); });

  it('premier passage : jeton posé, invisible au JavaScript, pour un an', async () => {
    const cookie = deviceCookie(await visit(`/message?to=${ID}&name=Camille`));
    expect(cookie).toMatch(/^irs_sender=[0-9a-f-]{36};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=31536000/);
  });

  it('jeton déjà posé : gardé tel quel (un porteur peut toujours le bloquer)', async () => {
    expect(deviceCookie(await visit('/message', `irs_sender=${crypto.randomUUID()}`))).toBeUndefined();
  });

  it('valeur invalide : remplacée par un vrai jeton', async () => {
    expect(deviceCookie(await visit('/message', 'irs_sender=pas-un-jeton'))).toMatch(/^irs_sender=[0-9a-f-]{36};/);
  });

  it.each([`/profil/${ID}`, `/conversation/${ID}`, '/'])('%s : rien n’est posé', async (path) => {
    expect(deviceCookie(await visit(path))).toBeUndefined();
  });
});

describe('push : un service qui ne répond pas ne retient pas la fonction', () => {
  it('chaque envoi a son délai', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    const { notifyMemberSubscribers, PUSH_TIMEOUT_MS } = await import('@/lib/push-notify');
    expect(await notifyMemberSubscribers({ memberId: 'm-1', title: 'Nouveau signal' })).toMatchObject({ sent: 1 });
    expect(push.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/abc' }), expect.any(String), { timeout: PUSH_TIMEOUT_MS });
    vi.unstubAllEnvs();
  });
});
