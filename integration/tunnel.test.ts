// integration/tunnel.test.ts
// Tunnel complet, ROUTES RÉELLES contre une VRAIE base (Postgres + PostgREST, les
// migrations du dépôt) : achat → paiement → impression → activation → scan →
// message → remboursement.
//
// Ce qui est réel : les handlers Next, supabase-js, PostgREST (JWT service_role),
// le SQL (RPC create_member_with_code / record_scan, contraintes, index, grants).
// Ce qui est simulé : Stripe (SDK), Printful + Resend (fetch), le stockage de
// fichiers, l'authentification Supabase (session) et Upstash (rate limit).
//
// Lancement : cf. integration/README.md (`npm run test:integration`).

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

const DB_URL        = process.env.INTEGRATION_DATABASE_URL ?? '';
const POSTGREST_URL = process.env.INTEGRATION_POSTGREST_URL ?? '';
const JWT_SECRET    = process.env.INTEGRATION_JWT_SECRET ?? '';
const ENABLED       = !!(DB_URL && POSTGREST_URL && JWT_SECRET);

// ─── Environnement de l'app (lu au chargement des modules) ────────────────────
const SUPABASE_URL = 'http://supabase.test';
const APP_URL      = 'https://app.test';

function signJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  const sig  = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

const SERVICE_KEY = ENABLED ? signJwt({ role: 'service_role', iss: 'integration' }) : 'unused';
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL:      SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ENABLED ? signJwt({ role: 'anon' }) : 'unused',
  SUPABASE_SERVICE_ROLE_KEY:     SERVICE_KEY,
  NEXT_PUBLIC_APP_URL:           APP_URL,
  STRIPE_SECRET_KEY:             'sk_test_integration',
  STRIPE_PRICE_ID:               'price_test_tee',
  STRIPE_WEBHOOK_SECRET:         'whsec_integration',
  RESEND_API_KEY:                're_test_integration',
  PRINTFUL_API_TOKEN:            'printful_test',
  PRINTFUL_VARIANT_ID:           '4012',
  SHORT_DOMAIN:                  'https://inreal.me',
});

// ─── Faux services externes ───────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const sent = {
  printful: [] as { body: Record<string, unknown> }[],
  emails:   [] as { to: string[]; subject: string; html: string }[],
  uploads:  [] as string[],
  stripeSessions: [] as Record<string, unknown>[],
};

// Toute requête supabase-js passe ici : /rest/v1 → PostgREST réel, /storage → simulé.
async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.startsWith('/rest/v1/')) {
    const target = `${POSTGREST_URL}${url.pathname.slice('/rest/v1'.length)}${url.search}`;
    return realFetch(target, init);
  }
  if (url.pathname.startsWith('/storage/v1/object/')) {
    sent.uploads.push(url.pathname.replace('/storage/v1/object/', ''));
    return new Response(JSON.stringify({ Key: url.pathname }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`supabaseFetch : route non simulée ${url.pathname}`);
}

// fetch global = Printful / Resend / géocodage / realtime (jamais le réseau réel).
vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (href.startsWith('https://api.printful.com/orders')) {
    sent.printful.push({ body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ result: { id: 900000 + sent.printful.length } }), { status: 200 });
  }
  if (href.startsWith('https://api.resend.com/')) {
    sent.emails.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200 });
  }
  if (href.startsWith(SUPABASE_URL)) return supabaseFetch(input, init);
  return new Response('{}', { status: 404 });
});

vi.mock('@/lib/supabase-admin', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabaseAdmin: createClient(SUPABASE_URL, SERVICE_KEY, {
      auth:   { autoRefreshToken: false, persistSession: false },
      global: { fetch: supabaseFetch },
    }),
  };
});

const SHIPPING = {
  name: 'Jeanne Test',
  address: { line1: '1 rue de Rivoli', line2: null, city: 'Paris', state: null, country: 'FR', postal_code: '75001' },
};
vi.mock('stripe', () => {
  class StripeError extends Error { statusCode = 400; }
  class Stripe {
    static errors = { StripeError };
    checkout = { sessions: {
      create: async (params: Record<string, unknown>) => {
        sent.stripeSessions.push(params);
        const id = `cs_test_${sent.stripeSessions.length}`;
        return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
      },
      retrieve: async (id: string) => ({
        id, customer_details: { email: 'buyer@example.com', ...SHIPPING },
        collected_information: { shipping_details: SHIPPING },
      }),
    } };
    // Signature non testée ici (constructEvent réel couvert par Stripe) : on parse.
    webhooks = { constructEvent: (body: string) => JSON.parse(body) };
  }
  return { default: Stripe };
});

// Session Supabase : l'utilisateur « connecté » est piloté par le test.
let currentUser: { id: string; email: string } | null = null;
vi.mock('@/lib/require-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/require-auth')>();
  const { NextResponse } = await import('next/server');
  return {
    ...actual,
    requireAuth: async () => currentUser
      ? { user: currentUser }
      : NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }),
    getOptionalUser: async () => currentUser,
  };
});

vi.mock('@/lib/ratelimit', () => {
  const ok = async () => ({ success: true, limit: 100, remaining: 99, reset: 0 });
  return {
    checkPublicRateLimit: ok, checkAuthRateLimit: ok, checkMessageRateLimit: ok,
    checkScanRateLimit: ok, checkResendEmailRateLimit: ok,
    isNewScan: async () => true, releaseScanDedup: async () => {},
    getIp: (req: Request) => req.headers.get('x-forwarded-for') ?? 'anonymous',
    rateLimitHeaders: () => ({}),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sql(query: string): string {
  return execFileSync('psql', [DB_URL, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}

function req(path: string, init: { method?: string; body?: unknown; cookie?: string; ip?: string; raw?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': init.ip ?? '203.0.113.7', ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`${APP_URL}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  });
}

function stripeEvent(type: string, object: Record<string, unknown>) {
  return req('/api/webhook/stripe', {
    raw: JSON.stringify({ id: `evt_${type}_${Date.now()}`, type, data: { object } }),
    headers: { 'stripe-signature': 't=0,v1=simulated' },   // présence exigée par la route
  });
}

// ─── Le tunnel ────────────────────────────────────────────────────────────────
describe.skipIf(!ENABLED)('Tunnel achat → impression → activation → scan → message → remboursement', () => {
  const BUYER = { id: crypto.randomUUID(), email: `buyer-${Date.now()}@example.com` };
  let checkout: typeof import('@/app/api/shop/checkout/route');
  let webhook:  typeof import('@/app/api/webhook/stripe/route');
  let activate: typeof import('@/app/api/activate/route');
  let create:   typeof import('@/app/api/member/create/route');
  let update:   typeof import('@/app/api/member/update/route');
  let shortRedirect: typeof import('@/app/r/[code]/route');
  let scan:     typeof import('@/app/api/scan/route');
  let message:  typeof import('@/app/api/message/route');

  let orderId = '';
  let sessionId = '';
  let code = '';
  let shortCode = '';
  let memberId = '';
  const paymentIntent = `pi_test_${Date.now()}`;

  const completed = () => stripeEvent('checkout.session.completed', {
    id: sessionId, mode: 'payment', payment_intent: paymentIntent, amount_total: 5900,
    customer_email: BUYER.email, customer_details: { email: BUYER.email },
    metadata: { orderId, tshirtColor: 'dark', tshirtSize: 'L', qrStyle: 'rounded' },
  });

  beforeAll(async () => {
    checkout      = await import('@/app/api/shop/checkout/route');
    webhook       = await import('@/app/api/webhook/stripe/route');
    activate      = await import('@/app/api/activate/route');
    create        = await import('@/app/api/member/create/route');
    update        = await import('@/app/api/member/update/route');
    shortRedirect = await import('@/app/r/[code]/route');
    scan          = await import('@/app/api/scan/route');
    message       = await import('@/app/api/message/route');
    // Compte Supabase Auth de l'acheteur (créé par /register côté app réelle).
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${BUYER.id}', '${BUYER.email}', now())`);
  });

  it('1. checkout : crée la commande pending et la session Stripe', async () => {
    const res = await checkout.POST(req('/api/shop/checkout', {
      body: { email: BUYER.email, tshirtColor: 'dark', tshirtSize: 'L', qrStyle: 'rounded', taglineId: null },
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const session = sent.stripeSessions.at(-1)!;
    orderId   = (session.metadata as Record<string, string>).orderId;
    sessionId = `cs_test_${sent.stripeSessions.length}`;
    expect(sql(`SELECT status || '|' || tshirt_size || '|' || stripe_session_id FROM orders WHERE id = '${orderId}'`))
      .toBe(`pending|L|${sessionId}`);
  });

  it('2. paiement : commande payée, code envoyé, QR réservé et imprimé tout de suite', async () => {
    const res = await webhook.POST(completed());
    expect(res.status).toBe(200);

    const [status, activationCode, reserved, printfulId, amount] =
      sql(`SELECT concat_ws('|', status, activation_code, short_code, printful_order_id, amount) FROM orders WHERE id = '${orderId}'`).split('|');
    expect(status).toBe('paid');
    expect(amount).toBe('5900');                       // vrai total Stripe, pas le 4900 figé
    expect(activationCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(reserved).toMatch(/^[a-z0-9]{2,6}$/);
    expect(printfulId).toBe('900001');
    code = activationCode;
    shortCode = reserved;

    // Email d'activation avec le code
    expect(sent.emails.at(-1)?.to).toEqual([BUYER.email]);
    expect(sent.emails.at(-1)?.html).toContain(code);

    // Printful : bon variant, adresse de livraison, QR au dos + logo poitrine
    const order = sent.printful.at(-1)!.body as { external_id: string; recipient: { city: string }; items: { files: { type: string; url: string }[] }[] };
    expect(order.external_id).toBe(orderId);
    expect(order.recipient.city).toBe('Paris');
    expect(order.items[0].files.map(f => f.type)).toEqual(['back', 'front']);
    expect(order.items[0].files[0].url).toContain(`qrcodes/orders/${orderId}/qr-dark.svg`);
    expect(sent.uploads).toContain(`qrcodes/orders/${orderId}/qr-dark.svg`);
  });

  it('3. webhook rejoué : idempotent (ni second code, ni seconde impression)', async () => {
    const printfulBefore = sent.printful.length;
    const res = await webhook.POST(completed());
    expect(res.status).toBe(200);
    expect(sent.printful.length).toBe(printfulBefore);
    expect(sql(`SELECT activation_code FROM orders WHERE id = '${orderId}'`)).toBe(code);
    expect(sql(`SELECT count(*) FROM activation_codes WHERE code = '${code}'`)).toBe('1');
  });

  it('4. QR scanné avant activation → page « bientôt »', async () => {
    const res = await shortRedirect.GET(req(`/r/${shortCode}`, { method: 'GET' }), { params: { code: shortCode } });
    expect(res.headers.get('location')).toBe(`${APP_URL}/tee/en-attente`);
  });

  it('5. activation : le code est valide, le profil hérite du QR déjà imprimé', async () => {
    const check = await activate.POST(req('/api/activate', { body: { code } }));
    expect(await check.json()).toEqual({ valid: true });

    currentUser = BUYER;
    const res = await create.POST(req('/api/member/create', {
      body: { name: 'Jeanne', pitch: 'Café ou expo ?', activationCode: code, acceptedTerms: true },
    }));
    expect(res.status).toBe(200);
    memberId = (await res.json()).memberId;
    expect(memberId).toMatch(/^[0-9a-f-]{36}$/);

    const [inherited, qrUrl, terms] =
      sql(`SELECT concat_ws('|', short_code, qr_code_url, terms_accepted_at IS NOT NULL) FROM members WHERE id = '${memberId}'`).split('|');
    expect(inherited).toBe(shortCode);                 // le tee imprimé pointe vers CE profil
    expect(qrUrl).toContain(`qrcodes/orders/${orderId}/qr-dark.svg`);
    expect(terms).toBe('t');
    expect(sql(`SELECT used FROM activation_codes WHERE code = '${code}'`)).toBe('t');
    expect(sent.printful.length).toBe(1);              // pas de réimpression
  });

  it('6. code déjà consommé : refusé', async () => {
    const res = await activate.POST(req('/api/activate', { body: { code } }));
    expect((await res.json()).valid).toBe(false);
  });

  it('7. QR scanné après activation → profil du porteur', async () => {
    const res = await shortRedirect.GET(req(`/r/${shortCode}`, { method: 'GET' }), { params: { code: shortCode } });
    expect(res.headers.get('location')).toBe(`${APP_URL}/profil/${memberId}`);
  });

  it('8. scan : enregistré via record_scan (service_role), compteur incrémenté', async () => {
    const res = await scan.POST(req('/api/scan', { body: { memberId, scannerName: 'Léa', latitude: 48.85661, longitude: 2.35222 } }));
    expect(await res.json()).toEqual({ ok: true });
    expect(sql(`SELECT scan_count FROM members WHERE id = '${memberId}'`)).toBe('1');
    // Géoloc arrondie à 3 décimales avant stockage (minimisation RGPD)
    expect(sql(`SELECT latitude || ',' || longitude FROM scans WHERE member_id = '${memberId}'`)).toBe('48.857,2.352');
  });

  it('9. message : délivré une fois par appareil, puis « à lui de répondre »', async () => {
    const first = await message.POST(req('/api/message', { body: { memberId, content: 'Belle audace.', senderName: 'Léa' } }));
    expect(first.status).toBe(200);
    const deviceCookie = first.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(deviceCookie).toMatch(/^irs_sender=/);
    expect(sql(`SELECT count(*) FROM messages WHERE member_id = '${memberId}' AND parent_id IS NULL`)).toBe('1');

    const again = await message.POST(req('/api/message', { body: { memberId, content: 'Encore moi' }, cookie: deviceCookie }));
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe('already_messaged');
  });

  it('10. remboursement total : commande remboursée, profil suspendu et verrouillé', async () => {
    const res = await webhook.POST(stripeEvent('charge.refunded', {
      payment_intent: paymentIntent, refunded: true, amount: 5900, amount_refunded: 5900,
    }));
    expect(res.status).toBe(200);
    expect(sql(`SELECT status FROM orders WHERE id = '${orderId}'`)).toBe('refunded');
    expect(sql(`SELECT is_paused || '|' || (suspended_at IS NOT NULL) FROM members WHERE id = '${memberId}'`)).toBe('true|true');

    // Le porteur ne peut pas lever la pause…
    const unpause = await update.PATCH(req('/api/member/update', { method: 'PATCH', body: { is_paused: false } }));
    expect(unpause.status).toBe(403);
    expect((await unpause.json()).code).toBe('suspended');
    // …et la base le refuse aussi (contrainte 054), même en contournant l'API.
    expect(() => sql(`UPDATE members SET is_paused = false WHERE id = '${memberId}'`))
      .toThrow(/members_suspended_implies_paused/);

    // Les scanneurs voient « indisponible ».
    const blocked = await message.POST(req('/api/message', { body: { memberId, content: 'Coucou' }, ip: '198.51.100.9' }));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('paused');
  });
});
