// App installable (écran d'accueil) :
// - icônes PNG : l'iPhone ne lit pas le SVG (capture floue de la page à la
//   place du logo), Chrome veut 192 et 512 px, le badge Android n'est gardé
//   qu'en silhouette ;
// - manifestes de page : l'app installée s'ouvre sur l'adresse de départ du
//   manifeste. Celle de « Mon espace » s'ouvrait sur l'accueil du site ; la
//   conversation, que le passant est invité à ajouter à l'écran d'accueil pour
//   être notifié, n'avait aucun manifeste lisible (diffusé dans le <body>) ;
// - « Mon espace » sur iPhone : le porteur n'entendait jamais parler des
//   notifications, que Safari réserve à l'app installée ;
// - abonnement : un échec passait pour une réussite, et une fois l'autorisation
//   donnée le bouton ne revenait jamais ;
// - sur iPhone, Safari ne lit le manifeste qu'au chargement de la page : on
//   arrive sur la conversation et sur « Mon espace » par un chargement complet.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { APP_ICONS, renderIcon } from '../../scripts/build-app-icons.mjs';
import manifest from '../../public/manifest.json';
import { GET as dashboardManifest } from '@/app/dashboard/manifest.webmanifest/route';
import { GET as conversationManifest } from '@/app/conversation/[messageId]/manifest.webmanifest/route';
import { notificationOffer, resyncPush, subscribePush, SW_READY_TIMEOUT_MS } from '@/lib/push-client';

vi.mock('next/font/google', () => ({ Cormorant_Garamond: () => ({ variable: '' }), Montserrat: () => ({ variable: '' }) }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { members: { name: 'Camille' } } }) }) }) }),
  },
}));

const PUBLIC = path.resolve(__dirname, '../../public');
const ID = '541c253f-592d-4f6e-8de6-d32676a72df1';

/** Pixels RGBA d'un PNG de public/, relus par resvg à leur taille. */
function pixelsOf(file: string, size: number) {
  const b64 = readFileSync(path.join(PUBLIC, file)).toString('base64');
  return new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image width="${size}" height="${size}" href="data:image/png;base64,${b64}"/></svg>`,
  ).render();
}

const PNG_ICONS = APP_ICONS.filter(
  (icon): icon is (typeof APP_ICONS)[number] & { size: number } => icon.size !== undefined,
);

/** Largeur et hauteur lues dans l'en-tête du PNG. */
function pngSize(file: string): [number, number] {
  const png = readFileSync(path.join(PUBLIC, file));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('icônes de l’app installable', () => {
  it.each(PNG_ICONS)(
    '$file correspond au script (sinon : node scripts/build-app-icons.mjs)', (icon) => {
      expect(pngSize(icon.file)).toEqual([icon.size, icon.size]);
      const expected = renderIcon(icon).pixels;
      const actual = pixelsOf(icon.file, icon.size).pixels;
      let maxDiff = 0;
      for (let i = 0; i < expected.length; i++) maxDiff = Math.max(maxDiff, Math.abs(expected[i] - actual[i]));
      expect(maxDiff).toBeLessThanOrEqual(2);
    });

  it('icon.svg correspond au script', () => {
    expect(readFileSync(path.join(PUBLIC, 'icon.svg'), 'utf8')).toBe(APP_ICONS.find((i) => i.file === 'icon.svg')!.svg);
  });

  it.each([['apple-touch-icon.png', 180], ['icon-maskable-512.png', 512]] as const)(
    '%s : plein cadre, sans transparence (le système arrondit lui-même)', (file, size) => {
      const { pixels } = pixelsOf(file, size);
      let seeThrough = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) seeThrough++;
      expect(seeThrough).toBe(0);
    });

  it('iPhone : icône PNG pour l’écran d’accueil, barre d’état opaque', async () => {
    const { metadata } = await import('@/app/layout');
    expect(metadata.icons).toMatchObject({ apple: '/apple-touch-icon.png' });
    // « black-translucent » : l'app installée dessinait sous l'heure et la batterie.
    expect(metadata.appleWebApp).toMatchObject({ statusBarStyle: 'black' });
    // Next n'écrit que « mobile-web-app-capable » ; sans la version Apple, Safari
    // ignore la couleur de la barre d'état.
    expect(metadata.other).toMatchObject({ 'apple-mobile-web-app-capable': 'yes' });
  });

  it('badge de notification : logo blanc sur fond transparent', () => {
    const { pixels } = pixelsOf('notification-badge.png', 96);
    const at = (x: number, y: number) => [...pixels.subarray((y * 96 + x) * 4, (y * 96 + x) * 4 + 4)];
    expect(at(0, 0)[3]).toBe(0);                       // coin : transparent
    expect(at(48, 48)).toEqual([255, 255, 255, 255]);  // pupille : blanche
  });
});

describe('manifestes', () => {
  it('site : PNG 192 et 512 px pour Chrome, icône adaptative à part', () => {
    expect(manifest.icons.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
      ['/icon-192.png', '192x192', 'any'],
      ['/icon-512.png', '512x512', 'any'],
      ['/icon-maskable-512.png', '512x512', 'maskable'],
    ]);
    for (const icon of manifest.icons) {
      expect(pngSize(icon.src.slice(1)).join('x')).toBe(icon.sizes);
    }
    // ?src=app : « Mon espace », où « / » mène un porteur connecté, sait qu'on
    // l'ouvre depuis l'app installée (cf. lib/phone). L'identité reste « / ».
    expect(manifest).toMatchObject({ id: '/', start_url: '/?src=app', scope: '/', display: 'standalone' });
  });

  it('« Mon espace » : l’app installée s’ouvre sur le tableau de bord, qui la reconnaît', async () => {
    const res = dashboardManifest();
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    expect(await res.json()).toEqual({ ...manifest, id: '/dashboard', start_url: '/dashboard?src=app' });
  });

  it('conversation : l’app installée rouvre cette conversation', async () => {
    const res = await conversationManifest(new Request('http://x'), { params: Promise.resolve({ messageId: ID }) });
    expect(await res.json()).toEqual({ ...manifest, id: `/conversation/${ID}`, start_url: `/conversation/${ID}` });
  });

  it.each(['pas-un-uuid', '..', `${ID}x`])('conversation : identifiant invalide (« %s ») → 404', async (bad) => {
    const res = await conversationManifest(new Request('http://x'), { params: Promise.resolve({ messageId: bad }) });
    expect(res.status).toBe(404);
  });

  it('« Mon espace » déclare son manifeste', async () => {
    const { metadata } = await import('@/app/dashboard/page');
    expect(metadata.manifest).toBe('/dashboard/manifest.webmanifest');
  });

  // Les métadonnées de generateMetadata sont diffusées dans le <body> d'une page
  // dynamique, où Chrome et Safari ne cherchent pas le manifeste : il est posé par
  // le layout, que React place dans le <head>.
  it('conversation : manifeste posé par le layout, aucun dans les métadonnées', async () => {
    const { default: ConversationLayout } = await import('@/app/conversation/[messageId]/layout');
    const headTags = async (messageId: string) => {
      const tree = await ConversationLayout({ children: null, params: Promise.resolve({ messageId }) });
      return (tree.props as { children: unknown[] }).children;
    };
    const [manifestLink, ...appleTags] = await headTags(ID);
    expect(manifestLink).toMatchObject({ type: 'link', props: { rel: 'manifest', href: `/conversation/${ID}/manifest.webmanifest` } });
    expect(appleTags).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'meta', props: { name: 'apple-mobile-web-app-capable', content: 'yes' } }),
      expect.objectContaining({ type: 'meta', props: { name: 'apple-mobile-web-app-status-bar-style', content: 'black' } }),
    ]));
    expect((await headTags('pas-un-uuid'))[0]).toBe(false);

    const { generateMetadata } = await import('@/app/conversation/[messageId]/page');
    expect((await generateMetadata({ params: Promise.resolve({ messageId: ID }) })).manifest).toBeNull();
  });
});

describe('« Mon espace » : notifications selon l’appareil', () => {
  const IPHONE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

  /** Navigateur simulé : appareil, app installée ou non, API Notification. */
  function device({ ua, standalone = false, permission }: { ua: string; standalone?: boolean; permission?: NotificationPermission }) {
    vi.stubGlobal('navigator', { userAgent: ua, standalone, ...(permission ? { serviceWorker: {} } : {}) });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: standalone }),
      ...(permission ? { Notification: { permission } } : {}),
    });
    if (permission) vi.stubGlobal('Notification', { permission });
  }

  afterEach(() => { vi.unstubAllGlobals(); });

  it('iPhone dans Safari (pas d’API Notification) : expliquer l’ajout à l’écran d’accueil', () => {
    device({ ua: IPHONE });
    expect(notificationOffer(false)).toBe('ios-install');
  });

  it('iPhone dans Safari, aide masquée par le porteur : rien', () => {
    device({ ua: IPHONE });
    expect(notificationOffer(true)).toBe('none');
  });

  it('iPhone, app ouverte depuis l’écran d’accueil : proposer les notifications', () => {
    device({ ua: IPHONE, standalone: true, permission: 'default' });
    expect(notificationOffer(false)).toBe('ask');
  });

  it('Android : proposer les notifications, puis plus rien une fois répondu', () => {
    device({ ua: ANDROID, permission: 'default' });
    expect(notificationOffer(false)).toBe('ask');
    device({ ua: ANDROID, permission: 'granted' });
    expect(notificationOffer(false)).toBe('none');
  });
});

describe('abonnement aux notifications', () => {
  const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
  const subscription = { toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }) };

  /** Navigateur simulé : autorisation, service worker, réponse du serveur. */
  function browser({ permission = 'granted', ready, status = 200, existing = subscription }: {
    permission?: NotificationPermission; ready?: Promise<unknown>; status?: number; existing?: typeof subscription | null;
  } = {}) {
    const registration = { pushManager: { subscribe: vi.fn(async () => subscription), getSubscription: vi.fn(async () => existing) } };
    const requestPermission = vi.fn(async () => permission);
    const fetch = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal('Notification', { permission, requestPermission });
    vi.stubGlobal('window', { Notification: {}, atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary') });
    vi.stubGlobal('navigator', { serviceWorker: {
      register: vi.fn(async () => registration),
      ready: ready ?? Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
    } });
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', Buffer.from('cle-publique-de-test').toString('base64url'));
    return { requestPermission, fetch };
  }

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('enregistré par le serveur : réussi, avec la portée demandée', async () => {
    const { fetch } = browser();
    expect(await subscribePush({ memberId: ID })).toBe(true);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ memberId: ID, subscription: { endpoint: ENDPOINT } });
  });

  it('serveur en erreur (429) : échec, l’interface ne dit pas « activées »', async () => {
    browser({ status: 429 });
    expect(await subscribePush({ messageId: ID })).toBe(false);
  });

  it('service worker jamais actif : échec au bout du délai, pas d’attente sans fin', async () => {
    vi.useFakeTimers();
    browser({ ready: new Promise(() => {}) });
    const result = subscribePush({ memberId: ID });
    await vi.advanceTimersByTimeAsync(SW_READY_TIMEOUT_MS);
    expect(await result).toBe(false);
  });

  it('autorisation refusée : échec, rien n’est envoyé', async () => {
    const { fetch } = browser({ permission: 'denied' });
    expect(await subscribePush({ memberId: ID })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sans clé VAPID : échec, sans demander l’autorisation pour rien', async () => {
    const { requestPermission } = browser();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    expect(await subscribePush({ memberId: ID })).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('déjà accordées : l’abonnement de l’appareil est renvoyé ; absent, il faut reproposer le bouton', async () => {
    const { fetch } = browser();
    expect(await resyncPush({ memberId: ID })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    browser({ existing: null });
    expect(await resyncPush({ memberId: ID })).toBe(false);
  });
});

// Sur iPhone, Safari ne lit le manifeste qu'au chargement de la page (WebKit,
// DocumentLoader::loadApplicationManifest) : arrivé par une navigation interne,
// le passant installait le manifeste du site, qui s'ouvre sur l'accueil.
describe('arrivées sur une page installable : chargement complet', () => {
  const SRC = path.resolve(__dirname, '..');
  const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

  it.each([
    ['app/message/page.tsx', /openFullPage\(conversationUrl\)/g, 2],
    ['app/contact/confirme/page.tsx', /<a href=\{`\/conversation\//g, 1],
    ['app/profil/[memberId]/ProfilClient.tsx', /<a href=\{convUrl\}/g, 1],
    ['app/auth/login/page.tsx', /openFullPage\(redirect\)/g, 1],
  ] as const)('%s', (file, pattern, count) => {
    const source = read(file);
    expect(source.match(pattern)?.length ?? 0).toBe(count);
    expect(source).not.toMatch(/router\.push\(conversationUrl\)|<Link href=\{convUrl\}|<Link href=\{`\/conversation\//);
  });
});
