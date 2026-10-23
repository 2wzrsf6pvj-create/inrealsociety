// public/sw.js : rien de personnel dans Cache Storage, et une page d'attente hors
// connexion pour l'app installée.
// - La v1 précachait « / » avec les cookies : pour un porteur connecté, la
//   redirection vers « Mon espace » rangeait sa page (prénom, messages) sous « / ».
// - Toute page HTML hors /dashboard et /conversation était gardée, administration
//   comprise, et les données des navigations internes de Next (?_rsc=) aussi.
// Le service worker est exécuté ici avec un navigateur simulé.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Listener = (event: Record<string, unknown>) => void;

const SW = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

function loadServiceWorker(network: (req: Request) => Promise<Response>) {
  const listeners: Record<string, Listener> = {};
  const stored = new Map<string, Response>();
  const addAll = vi.fn<(requests: Request[]) => Promise<void>>(async () => {});
  const cache = { addAll, put: vi.fn(async (req: Request, res: Response) => { stored.set(req.url, res); }) };
  const caches = {
    open: vi.fn(async () => cache),
    match: vi.fn(async (req: Request | string) => stored.get(typeof req === 'string' ? `https://irs.test${req}` : req.url)),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: 'https://irs.test' },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
    skipWaiting: () => {}, clients: { claim: async () => {} },
  };
  // Dans un service worker, une adresse relative part de son origine.
  class SwRequest extends Request {
    constructor(input: string, init?: RequestInit) { super(new URL(input, self.location.origin), init); }
  }
  new Function('self', 'caches', 'fetch', 'Request', SW)(self, caches, network, SwRequest);

  /** Requête vue par le service worker : réponse fournie, ou undefined s'il la laisse passer. */
  async function request(pathname: string, { html = true, mode = 'navigate', destination = 'document' } = {}) {
    const req = new Request(`https://irs.test${pathname}`, { headers: html ? { accept: 'text/html' } : {} });
    Object.defineProperty(req, 'mode', { value: mode });
    Object.defineProperty(req, 'destination', { value: destination });
    let responded: Promise<Response> | undefined;
    listeners.fetch({ request: req, respondWith: (p: Promise<Response>) => { responded = p; } });
    return responded && (await responded);
  }
  return { listeners, addAll, stored, request };
}

const page = (body: string, redirected = false) => {
  const res = new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
  if (redirected) Object.defineProperty(res, 'redirected', { value: true });
  return res;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('service worker', () => {
  let offline: boolean;
  const network = vi.fn(async (req: Request) => {
    if (offline) throw new TypeError('Failed to fetch');
    return req.url.endsWith('/') ? page('Mon espace — Camille', true) : page('page publique');
  });
  beforeEach(() => { offline = false; network.mockClear(); });

  it('précache sans cookies : la redirection d’un porteur connecté n’y entre pas', async () => {
    const sw = loadServiceWorker(network);
    let installing: Promise<unknown> | undefined;
    sw.listeners.install({ waitUntil: (p: Promise<unknown>) => { installing = p; } });
    await installing;
    const requests = sw.addAll.mock.calls[0][0];
    expect(requests.length).toBeGreaterThan(0);
    for (const req of requests) expect(req.credentials).toBe('omit');
  });

  it('page publique redirigée (« / » → « Mon espace ») : jamais gardée', async () => {
    const sw = loadServiceWorker(network);
    expect(await (await sw.request('/'))!.text()).toBe('Mon espace — Camille');
    await settle();
    expect(sw.stored.size).toBe(0);
  });

  it('page publique : gardée, puis servie hors connexion', async () => {
    const sw = loadServiceWorker(network);
    await sw.request('/shop');
    await settle();
    offline = true;
    expect(await (await sw.request('/shop'))!.text()).toBe('page publique');
  });

  it.each(['/dashboard', '/conversation/abc', '/admin', '/register'])(
    '%s : réseau seul, et page d’attente hors connexion', async (pathname) => {
      const sw = loadServiceWorker(network);
      await sw.request(pathname);
      await settle();
      expect(sw.stored.size).toBe(0);
      offline = true;
      const res = await sw.request(pathname);
      expect(res!.status).toBe(503);
      expect(await res!.text()).toContain('Pas de connexion');
    });

  it('données des navigations internes de Next (?_rsc=) : jamais interceptées', async () => {
    const sw = loadServiceWorker(network);
    expect(await sw.request('/dashboard?_rsc=1', { html: false, mode: 'cors', destination: '' })).toBeUndefined();
    expect(await sw.request('/admin?_rsc=1', { html: false, mode: 'cors', destination: '' })).toBeUndefined();
  });
});
