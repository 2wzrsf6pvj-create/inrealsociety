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
  CRON_SECRET:                   'cron-integration-secret',
  ADMIN_ALERT_EMAIL:             'alertes@example.com',
});

// ─── Faux services externes ───────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const sent = {
  // Préfixe propre à l'exécution : les ids de session simulés restent uniques
  // quand on relance le test sur la même base.
  run:      Date.now().toString(36),
  printful: [] as { body: Record<string, unknown> }[],
  emails:   [] as { to: string[]; subject: string; html: string; reply_to?: string; headers?: Record<string, string> }[],
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
  // Suppression du compte Supabase Auth (fin de /api/member/delete).
  if (url.pathname.startsWith('/auth/v1/admin/users/')) {
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
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
// Abonnements premium connus du faux Stripe, pilotés par le test.
const stripeState = {
  customers: 0,
  subs:      [] as { id: string; customer: string; status: string }[],
  cancelled: [] as string[],
  failCancel: false,
};
vi.mock('stripe', () => {
  class StripeError extends Error { statusCode = 400; }
  class Stripe {
    static errors = { StripeError };
    customers = { create: async () => ({ id: `cus_test${sent.run}${++stripeState.customers}` }) };
    subscriptions = {
      list: async ({ customer }: { customer: string }) => ({ data: stripeState.subs.filter(s => s.customer === customer) }),
      retrieve: async (id: string) => {
        const sub = stripeState.subs.find(s => s.id === id);
        if (!sub) throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
        return sub;
      },
      cancel: async (id: string) => {
        if (stripeState.failCancel) throw new Error('Stripe injoignable');
        const sub = stripeState.subs.find(s => s.id === id)!;
        sub.status = 'canceled';
        stripeState.cancelled.push(id);
        return sub;
      },
    };
    checkout = { sessions: {
      create: async (params: Record<string, unknown>) => {
        sent.stripeSessions.push(params);
        const id = `cs_test_${sent.run}_${sent.stripeSessions.length}`;
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
let currentUser: { id: string; email: string; email_confirmed_at?: string } | null = null;
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
    checkContactVerifyRateLimit: async () => true,
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
  let orderCode: typeof import('@/app/api/order-code/route');
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
    collected_information: { shipping_details: SHIPPING },
    metadata: { orderId, tshirtColor: 'dark', tshirtSize: 'L', qrStyle: 'rounded' },
  });

  beforeAll(async () => {
    checkout      = await import('@/app/api/shop/checkout/route');
    webhook       = await import('@/app/api/webhook/stripe/route');
    orderCode     = await import('@/app/api/order-code/route');
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
    sessionId = `cs_test_${sent.run}_${sent.stripeSessions.length}`;
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

    // Email d'activation avec le code et le récapitulatif de la commande
    expect(sent.emails.at(-1)?.to).toEqual([BUYER.email]);
    const html = sent.emails.at(-1)!.html;
    expect(html).toContain(code);
    expect(html).toContain('T-shirt Noir · L');
    expect(html).toContain('QR seul, sans accroche');
    // Franchise de TVA : le total payé, sans « TTC ».
    expect(html).toMatch(/Total payé[\s\S]*59,00\s€/);
    expect(html).not.toContain('TTC');
    expect(html).toContain('Jeanne Test, 1 rue de Rivoli, 75001 Paris, France');

    // Page de confirmation : code et récapitulatif, sans donnée personnelle
    const page = await (await orderCode.GET(req(`/api/order-code?session=${sessionId}`, { method: 'GET' }))).json();
    expect(page.code).toBe(code);
    expect(page.recap).toMatchObject({ article: 'T-shirt Noir · L', tagline: null, shipping: null, address: null });
    expect(page.recap.total).toMatch(/^59,00\s€$/);
    expect(JSON.stringify(page)).not.toContain(BUYER.email);

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
    const res = await shortRedirect.GET(req(`/r/${shortCode}`, { method: 'GET' }), { params: Promise.resolve({ code: shortCode }) });
    expect(res.headers.get('location')).toBe(`${APP_URL}/tee/en-attente`);
  });

  it('5. activation : le code est valide, le profil hérite du QR déjà imprimé', async () => {
    const check = await activate.POST(req('/api/activate', { body: { code } }));
    expect(await check.json()).toEqual({ valid: true });

    currentUser = BUYER;
    // Sans la déclaration « 18 ans ou plus » : refusé, et le code n'est pas consommé.
    const minor = await create.POST(req('/api/member/create', {
      body: { name: 'Jeanne', pitch: 'Café ou expo ?', activationCode: code, acceptedTerms: true },
    }));
    expect(minor.status).toBe(400);
    expect(sql(`SELECT used FROM activation_codes WHERE code = '${code}'`)).toBe('f');

    const res = await create.POST(req('/api/member/create', {
      body: { name: 'Jeanne', pitch: 'Café ou expo ?', activationCode: code, acceptedTerms: true, isAdult: true },
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
    const res = await shortRedirect.GET(req(`/r/${shortCode}`, { method: 'GET' }), { params: Promise.resolve({ code: shortCode }) });
    expect(res.headers.get('location')).toBe(`${APP_URL}/profil/${memberId}`);
  });

  it('8. scan : enregistré via record_scan (service_role), compteur incrémenté', async () => {
    const res = await scan.POST(req('/api/scan', { body: { memberId, scannerName: 'Léa', latitude: 48.85661, longitude: 2.35222 } }));
    expect(await res.json()).toEqual({ ok: true });
    expect(sql(`SELECT scan_count FROM members WHERE id = '${memberId}'`)).toBe('1');
    // Minimisation RGPD : aucune coordonnée stockée, seule la ville peut l'être
    expect(sql(`SELECT count(*) FROM scans WHERE member_id = '${memberId}' AND latitude IS NULL AND longitude IS NULL`)).toBe('1');
  });

  it('9. message : délivré une fois par appareil, puis renvoi vers la conversation', async () => {
    const first = await message.POST(req('/api/message', { body: { memberId, content: 'Belle audace.', senderName: 'Léa' } }));
    expect(first.status).toBe(200);
    const deviceCookie = first.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(deviceCookie).toMatch(/^irs_sender=/);
    const firstId = (await first.json()).messageId;
    expect(sql(`SELECT count(*) FROM messages WHERE member_id = '${memberId}' AND parent_id IS NULL`)).toBe('1');

    const again = await message.POST(req('/api/message', { body: { memberId, content: 'Encore moi' }, cookie: deviceCookie }));
    expect(again.status).toBe(409);
    const refused = await again.json();
    expect(refused.code).toBe('already_messaged');
    expect(refused.conversationId).toBe(firstId);   // même sans le lien en localStorage
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

// ─── Relance des acheteurs payés jamais activés (cron, migration 055) ─────────
describe.skipIf(!ENABLED)('Relance : payé mais jamais activé', () => {
  const email = `idle-${Date.now()}@example.com`;
  let orderId = '';
  let code = '';
  let cron: typeof import('@/app/api/cron/activation-reminder/route');
  let checkout: typeof import('@/app/api/shop/checkout/route');
  let webhook: typeof import('@/app/api/webhook/stripe/route');

  const runCron = async () => {
    const res = await cron.GET(req('/api/cron/activation-reminder', {
      method: 'GET', headers: { authorization: 'Bearer cron-integration-secret' },
    }));
    expect(res.status).toBe(200);
    return (await res.json()).orders as { sent: number; failed: number; error?: string };
  };
  const remindersTo = () => sent.emails.filter(e => e.to[0] === email);
  const ageOrder = (createdDaysAgo: number, lastReminderDaysAgo: number | null) => sql(
    `UPDATE orders SET created_at = now() - interval '${createdDaysAgo} days'` +
    (lastReminderDaysAgo === null ? '' : `, activation_reminder_at = now() - interval '${lastReminderDaysAgo} days'`) +
    ` WHERE id = '${orderId}'`);

  beforeAll(async () => {
    cron     = await import('@/app/api/cron/activation-reminder/route');
    checkout = await import('@/app/api/shop/checkout/route');
    webhook  = await import('@/app/api/webhook/stripe/route');
    currentUser = null;

    // Achat réel par les routes, puis plus rien : le profil n'est jamais créé.
    await checkout.POST(req('/api/shop/checkout', { body: { email, tshirtColor: 'light', tshirtSize: 'M', taglineId: null } }));
    orderId = (sent.stripeSessions.at(-1)!.metadata as Record<string, string>).orderId;
    const sessionId = `cs_test_${sent.run}_${sent.stripeSessions.length}`;
    await webhook.POST(stripeEvent('checkout.session.completed', {
      id: sessionId, mode: 'payment', payment_intent: `pi_idle_${Date.now()}`, amount_total: 5400,
      customer_email: email, customer_details: { email },
      metadata: { orderId, tshirtColor: 'light', tshirtSize: 'M', qrStyle: 'rounded' },
    }));
    code = sql(`SELECT activation_code FROM orders WHERE id = '${orderId}'`);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('rien avant J+2', async () => {
    const before = remindersTo().length;          // l'email d'activation du paiement
    await runCron();
    expect(remindersTo().length).toBe(before);
  });

  it('1re relance à J+2, avec le code et le lien d\'activation', async () => {
    ageOrder(3, null);
    const before = remindersTo().length;
    expect((await runCron()).error).toBeUndefined();
    const mails = remindersTo().slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/il manque votre profil/);
    expect(mails[0].html).toContain(code);
    expect(mails[0].html).toContain(`/register?code=${code}`);
    expect(sql(`SELECT activation_reminders_sent FROM orders WHERE id = '${orderId}'`)).toBe('1');
  });

  it('pas de doublon au run suivant', async () => {
    const before = remindersTo().length;
    await runCron();
    expect(remindersTo().length).toBe(before);
  });

  it('2e relance à J+7, puis plus jamais', async () => {
    ageOrder(8, 4);
    const before = remindersTo().length;
    await runCron();
    expect(remindersTo().length).toBe(before + 1);
    expect(sql(`SELECT activation_reminders_sent FROM orders WHERE id = '${orderId}'`)).toBe('2');

    ageOrder(12, 4);
    await runCron();
    expect(remindersTo().length).toBe(before + 1);
  });

  it('un code déjà utilisé n\'est jamais relancé', async () => {
    sql(`UPDATE orders SET activation_reminders_sent = 0, activation_reminder_at = NULL, created_at = now() - interval '3 days' WHERE id = '${orderId}'`);
    sql(`UPDATE activation_codes SET used = true WHERE code = '${code}'`);
    const before = remindersTo().length;
    await runCron();
    expect(remindersTo().length).toBe(before);
  });
});

// ─── Signalements → bannissement automatique ──────────────────────────────────
describe.skipIf(!ENABLED)('Signalements : un appareil signalé par 3 porteurs est banni', () => {
  let report:  typeof import('@/app/api/report/route');
  let message: typeof import('@/app/api/message/route');
  const device  = crypto.randomUUID();   // jeton irs_sender du harceleur
  const wearers = [0, 1, 2, 3].map(() => ({ authId: crypto.randomUUID(), memberId: crypto.randomUUID() }));
  const msgIds: string[] = [];
  const alerts = () => sent.emails.filter(e => e.to[0] === 'alertes@example.com');

  beforeAll(async () => {
    report  = await import('@/app/api/report/route');
    message = await import('@/app/api/message/route');
    for (const w of wearers) {
      sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${w.authId}', 'p-${w.authId}@example.com', now())`);
      sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${w.memberId}', '${w.authId}', 'Porteur', 'p-${w.authId}@example.com')`);
    }
    // Le même appareil écrit aux trois premiers porteurs.
    for (const w of wearers.slice(0, 3)) {
      const id = crypto.randomUUID();
      msgIds.push(id);
      sql(`INSERT INTO messages (id, member_id, content, sender_token) VALUES ('${id}', '${w.memberId}', 'message insultant', '${device}')`);
    }
  });

  const reportAs = (i: number) => {
    currentUser = { id: wearers[i].authId, email: `p-${wearers[i].authId}@example.com` };
    return report.POST(req('/api/report', { body: { messageId: msgIds[i], memberId: wearers[i].memberId } }));
  };

  it('2 porteurs signalent : messages masqués, alerte envoyée, appareil pas encore banni', async () => {
    const before = alerts().length;
    expect((await reportAs(0)).status).toBe(200);
    expect((await reportAs(1)).status).toBe(200);
    expect(sql(`SELECT moderated FROM messages WHERE id = '${msgIds[0]}'`)).toBe('t');
    expect(sql(`SELECT count(*) FROM banned_devices WHERE sender_token = '${device}'`)).toBe('0');
    expect(alerts().length).toBe(before + 2);
    expect(alerts().at(-1)!.html).toContain('message insultant');
  });

  it('un porteur qui signale de nouveau le même appareil ne compte qu’une fois', async () => {
    expect((await reportAs(1)).status).toBe(200);
    expect(sql(`SELECT count(*) FROM message_reports WHERE sender_token = '${device}'`)).toBe('2');
  });

  it('3e porteur : appareil banni, il ne peut plus écrire à personne', async () => {
    expect((await reportAs(2)).status).toBe(200);
    expect(sql(`SELECT count(*) FROM banned_devices WHERE sender_token = '${device}'`)).toBe('1');
    expect(alerts().at(-1)!.subject).toContain('banni');

    const res = await message.POST(req('/api/message', {
      body:   { memberId: wearers[3].memberId, content: 'Belle audace.' },
      cookie: `irs_sender=${device}`,
    }));
    expect(res.status).toBe(403);
    // Dit clairement, avec la raison et le recours (choix de Clément, DSA art. 17).
    const data = await res.json();
    expect(data.code).toBe('banned');
    expect(data.error).toContain('CGV, article 9');
    expect(sql(`SELECT count(*) FROM messages WHERE member_id = '${wearers[3].memberId}'`)).toBe('0');
  });
});

// ─── Email du passant : réponses seulement après confirmation ────────────────
describe.skipIf(!ENABLED)('Email du passant : les réponses ne partent qu’après confirmation', () => {
  let message: typeof import('@/app/api/message/route');
  let reply:   typeof import('@/app/api/conversation/reply/route');
  let verify:  typeof import('@/app/api/contact/verify/route');
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const scannerEmail = `passant-${Date.now()}@example.com`;
  const device = crypto.randomUUID();
  let messageId = '';
  let token = '';
  const toScanner = () => sent.emails.filter(e => e.to[0] === scannerEmail);

  beforeAll(async () => {
    message = await import('@/app/api/message/route');
    reply   = await import('@/app/api/conversation/reply/route');
    verify  = await import('@/app/api/contact/verify/route');
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', 'w-${wearer.authId}@example.com', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Camille', 'w-${wearer.authId}@example.com')`);
  });

  const memberReply = (content: string) => {
    currentUser = { id: wearer.authId, email: `w-${wearer.authId}@example.com` };
    return reply.POST(req('/api/conversation/reply', { body: { messageId, content, author: 'member' } }));
  };
  const scannerReply = (content: string) =>
    reply.POST(req('/api/conversation/reply', { body: { messageId, content, author: 'scanner' }, cookie: `irs_sender=${device}` }));
  const click = (t: string) => verify.GET(req(`/api/contact/verify?token=${t}`, { method: 'GET' }));

  it('le passant laisse son email : un lien de confirmation lui est envoyé', async () => {
    const res = await message.POST(req('/api/message', {
      body:   { memberId: wearer.memberId, content: 'Belle audace.', senderContact: scannerEmail },
      cookie: `irs_sender=${device}`,
    }));
    const data = await res.json();
    expect(data.contactVerification).toBe('sent');
    messageId = data.messageId;
    expect(toScanner()).toHaveLength(1);
    token = /token=([A-Za-z0-9_-]{43})/.exec(toScanner()[0].html)![1];
    expect(sql(`SELECT count(*) FROM contact_verifications WHERE message_id = '${messageId}' AND verified_at IS NULL`)).toBe('1');
    expect(sql(`SELECT count(*) FROM contact_verifications WHERE token_hash = '${token}'`)).toBe('0');   // jamais en clair
  });

  it('chacun son tour : le passant ne peut pas écrire deux fois de suite', async () => {
    const res = await scannerReply('Tu as vu mon message ?');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_your_turn');
  });

  it('le porteur répond avant la confirmation : rien ne part vers cette adresse', async () => {
    expect((await memberReply('Merci, ça me touche.')).status).toBe(200);
    expect(toScanner()).toHaveLength(1);   // toujours le seul lien de confirmation
  });

  it('chacun son tour : le porteur non plus', async () => {
    const res = await memberReply('Tu es là ?');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_your_turn');
  });

  it('lien invalide → page « lien invalide »', async () => {
    expect((await click('x'.repeat(43))).headers.get('location')).toContain('/contact/confirme?statut=invalide');
  });

  it('confirmation : la réponse déjà écrite part aussitôt', async () => {
    const location = (await click(token)).headers.get('location')!;
    expect(location).toContain('statut=ok');
    expect(location).toContain(`conversation=${messageId}`);
    expect(toScanner()).toHaveLength(2);
    expect(toScanner()[1].html).toContain('Merci, ça me touche.');
  });

  it('second clic : confirmé, rien de plus n’est envoyé', async () => {
    expect((await click(token)).headers.get('location')).toContain('statut=ok');
    expect(toScanner()).toHaveLength(2);
  });

  it('réponse suivante, après celle du passant : envoyée directement', async () => {
    expect((await scannerReply('Avec plaisir.')).status).toBe(200);
    expect((await memberReply('À bientôt peut-être.')).status).toBe(200);
    expect(toScanner()).toHaveLength(3);
    expect(toScanner()[2].html).toContain('À bientôt peut-être.');
  });
});

// ─── Purge hebdomadaire (058) : conversations éteintes, preuves RGPD bornées ──
describe.skipIf(!ENABLED)('Purge : conversations 12 mois après le dernier message, preuves RGPD 5 ans', () => {
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const stale = { root: crypto.randomUUID(), reply: crypto.randomUUID() };
  const alive = { root: crypto.randomUUID(), reply: crypto.randomUUID() };

  beforeAll(() => {
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', 'p-${wearer.authId}@example.com', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Purge', 'p-${wearer.authId}@example.com')`);
    // Éteinte : racine et réponse vieilles de 13 mois (+ sa vérification d'email)
    sql(`INSERT INTO messages (id, member_id, content, author, created_at) VALUES ('${stale.root}', '${wearer.memberId}', 'Ancienne', 'scanner', now() - interval '13 months')`);
    sql(`INSERT INTO messages (id, member_id, parent_id, content, author, created_at) VALUES ('${stale.reply}', '${wearer.memberId}', '${stale.root}', 'Réponse', 'member', now() - interval '13 months')`);
    sql(`INSERT INTO contact_verifications (message_id, email, token_hash) VALUES ('${stale.root}', 'x@example.com', 'h-${stale.root}')`);
    // Vivante : racine de 13 mois, dernière réponse il y a un mois
    sql(`INSERT INTO messages (id, member_id, content, author, created_at) VALUES ('${alive.root}', '${wearer.memberId}', 'Ancienne mais vivante', 'scanner', now() - interval '13 months')`);
    sql(`INSERT INTO messages (id, member_id, parent_id, content, author, created_at) VALUES ('${alive.reply}', '${wearer.memberId}', '${alive.root}', 'Récente', 'member', now() - interval '1 month')`);
    // Preuves RGPD : 6 ans (purgée) et 4 ans (gardée)
    sql(`INSERT INTO audit_logs (action, member_id, created_at) VALUES ('member.activated', '${wearer.memberId}', now() - interval '6 years'), ('member.activated', '${wearer.memberId}', now() - interval '4 years')`);
  });

  it('la conversation éteinte part avec ses réponses et sa vérification ; la vivante reste', () => {
    expect(Number(sql(`SELECT conversations_deleted FROM cleanup_old_data()`))).toBeGreaterThanOrEqual(1);
    expect(sql(`SELECT count(*) FROM messages WHERE id IN ('${stale.root}', '${stale.reply}')`)).toBe('0');
    expect(sql(`SELECT count(*) FROM contact_verifications WHERE message_id = '${stale.root}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM messages WHERE id IN ('${alive.root}', '${alive.reply}')`)).toBe('2');
  });

  it('preuve de consentement : gardée 5 ans, purgée au-delà', () => {
    expect(sql(`SELECT count(*) FROM audit_logs WHERE member_id = '${wearer.memberId}' AND action = 'member.activated'`)).toBe('1');
  });
});

// ─── Emails du porteur limités (059) ─────────────────────────────────────────
describe.skipIf(!ENABLED)('Emails du porteur : un par jour pour les scans, un par semaine pour le plafond', () => {
  let scan:    typeof import('@/app/api/scan/route');
  let message: typeof import('@/app/api/message/route');
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const email = `lim-${wearer.authId}@example.com`;
  const toWearer = () => sent.emails.filter(e => e.to[0] === email);

  beforeAll(async () => {
    scan    = await import('@/app/api/scan/route');
    message = await import('@/app/api/message/route');
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', '${email}', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Camille', '${email}')`);
  });

  it('deux scans le même jour : les deux comptent, un seul email', async () => {
    for (const ip of ['198.51.100.1', '198.51.100.2']) {
      expect((await scan.POST(req('/api/scan', { body: { memberId: wearer.memberId }, ip }))).status).toBe(200);
    }
    expect(sql(`SELECT scan_count FROM members WHERE id = '${wearer.memberId}'`)).toBe('2');
    expect(toWearer()).toHaveLength(1);
  });

  it('plafond gratuit atteint : le porteur est prévenu une fois, pas à chaque refus', async () => {
    for (let i = 0; i < 3; i++) {
      sql(`INSERT INTO messages (member_id, content, author) VALUES ('${wearer.memberId}', 'Conversation ${i}', 'scanner')`);
    }
    const before = toWearer().length;
    for (const ip of ['198.51.100.3', '198.51.100.4']) {
      const res = await message.POST(req('/api/message', { body: { memberId: wearer.memberId, content: 'Belle audace.' }, ip }));
      expect((await res.json()).code).toBe('conversation_limit');
    }
    expect(toWearer().length - before).toBe(1);
    expect(toWearer().at(-1)!.subject).toContain('quelqu\'un a essayé de vous écrire');
  });
});

// ─── Emails de scan coupables (061) ──────────────────────────────────────────
describe.skipIf(!ENABLED)('Emails de scan : coupés en un clic, réactivés dans les réglages', () => {
  let scan:   typeof import('@/app/api/scan/route');
  let optOut: typeof import('@/app/api/scan-emails/unsubscribe/route');
  let update: typeof import('@/app/api/member/update/route');
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const email = `opt-${wearer.authId}@example.com`;
  const toWearer = () => sent.emails.filter(e => e.to[0] === email);
  const scanEmails = () => sql(`SELECT scan_emails FROM members WHERE id = '${wearer.memberId}'`);
  // Le lendemain : l'email du jour est de nouveau disponible (059).
  const nextDay = () => sql(`UPDATE members SET scan_email_on = current_date - 1 WHERE id = '${wearer.memberId}'`);
  let ip = 10;
  const scanOnce = () => scan.POST(req('/api/scan', { body: { memberId: wearer.memberId }, ip: `198.51.100.${ip++}` }));

  beforeAll(async () => {
    scan   = await import('@/app/api/scan/route');
    optOut = await import('@/app/api/scan-emails/unsubscribe/route');
    update = await import('@/app/api/member/update/route');
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', '${email}', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Noé', '${email}')`);
  });

  it('par défaut actifs ; l’email répond à hello@ et porte la désinscription en un clic', async () => {
    expect(scanEmails()).toBe('t');
    expect((await scanOnce()).status).toBe(200);
    expect(toWearer()).toHaveLength(1);
    expect(toWearer()[0].reply_to).toBe('hello@inrealsociety.com');
    expect(toWearer()[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('un clic (POST du client mail) : coupés ; le scan suivant compte, sans email', async () => {
    const url = toWearer()[0].headers!['List-Unsubscribe'].slice(1, -1);
    expect((await optOut.POST(new NextRequest(url, { method: 'POST' }))).status).toBe(200);
    expect(scanEmails()).toBe('f');
    nextDay();
    expect((await scanOnce()).status).toBe(200);
    expect(sql(`SELECT scan_count FROM members WHERE id = '${wearer.memberId}'`)).toBe('2');
    expect(toWearer()).toHaveLength(1);
  });

  it('réactivés dans les réglages : l’email du jour repart', async () => {
    currentUser = { id: wearer.authId, email };
    const res = await update.PATCH(req('/api/member/update', { method: 'PATCH', body: { scan_emails: true } }));
    currentUser = null;
    expect(res.status).toBe(200);
    expect(scanEmails()).toBe('t');
    nextDay();
    await scanOnce();
    expect(toWearer()).toHaveLength(2);
  });
});

// ─── Parrainage par code dédié (060) ─────────────────────────────────────────
describe.skipIf(!ENABLED)('Parrainage : code dédié, ancien lien toujours valable', () => {
  let checkout: typeof import('@/app/api/shop/checkout/route');
  const parrain = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const parrainEmail = `parrain-${parrain.authId}@example.com`;
  let code = '';

  beforeAll(async () => {
    checkout = await import('@/app/api/shop/checkout/route');
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${parrain.authId}', '${parrainEmail}', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${parrain.memberId}', '${parrain.authId}', 'Camille', '${parrainEmail}')`);
    code = sql(`SELECT referral_code FROM members WHERE id = '${parrain.memberId}'`);
  });

  const buy = async (email: string, extra: Record<string, unknown>) => {
    const res = await checkout.POST(req('/api/shop/checkout', {
      body: { email, tshirtColor: 'dark', tshirtSize: 'M', taglineId: null, ...extra },
    }));
    expect(res.status).toBe(200);
    const orderId = (sent.stripeSessions.at(-1)!.metadata as Record<string, string>).orderId;
    return sql(`SELECT coalesce(referrer_id::text, 'aucun') FROM orders WHERE id = '${orderId}'`);
  };

  it('chaque membre reçoit un code à sa création, sans rapport avec son identifiant', () => {
    expect(code).toMatch(/^[a-hjkmnp-z2-8]{10}$/);
    expect(parrain.memberId).not.toContain(code);
  });

  it('commande via le code : le parrain est retrouvé côté serveur', async () => {
    expect(await buy(`filleul-a-${Date.now()}@example.com`, { referral: code })).toBe(parrain.memberId);
  });

  it('ancien lien à identifiant (champ actuel ou ancien champ) : toujours valable', async () => {
    expect(await buy(`filleul-b-${Date.now()}@example.com`, { referral: parrain.memberId })).toBe(parrain.memberId);
    expect(await buy(`filleul-c-${Date.now()}@example.com`, { referrerId: parrain.memberId })).toBe(parrain.memberId);
  });

  it('code inconnu, ou le parrain qui se parraine lui-même : pas de parrain', async () => {
    expect(await buy(`filleul-d-${Date.now()}@example.com`, { referral: 'abcdefghjk' })).toBe('aucun');
    expect(await buy(parrainEmail, { referral: code })).toBe('aucun');
  });
});

// ─── Premium : CGV, emails une seule fois, suppression qui résilie ───────────
describe.skipIf(!ENABLED)('Premium : CGV avant paiement, emails une seule fois, compte supprimé = abonnement résilié', () => {
  let subscribe: typeof import('@/app/api/subscription/checkout/route');
  let webhook:   typeof import('@/app/api/webhook/stripe/route');
  let remove:    typeof import('@/app/api/member/delete/route');
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const email = `prem-${wearer.authId}@example.com`;
  const toWearer = (subject: string) => sent.emails.filter(e => e.to[0] === email && e.subject.includes(subject));
  const member = (cols: string) => sql(`SELECT concat_ws('|', ${cols}) FROM members WHERE id = '${wearer.memberId}'`);
  const subId = `sub_test${sent.run}`;
  const END = 1795341600; // 22 novembre 2026, 10 h UTC
  let customerId = '';
  const subscription = (fields: Record<string, unknown>) => ({
    id: subId, customer: customerId, status: 'active', cancel_at: null, cancel_at_period_end: false, items: { data: [] }, ...fields,
  });

  beforeAll(async () => {
    subscribe = await import('@/app/api/subscription/checkout/route');
    webhook   = await import('@/app/api/webhook/stripe/route');
    remove    = await import('@/app/api/member/delete/route');
    process.env.STRIPE_PREMIUM_PRICE_ID = 'price_test_premium';
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', '${email}', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Camille', '${email}')`);
  });

  it('CGV non cochées : 400, aucune page de paiement', async () => {
    currentUser = { id: wearer.authId, email };
    const before = sent.stripeSessions.length;
    const res = await subscribe.POST(req('/api/subscription/checkout', { body: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('terms_required');
    expect(sent.stripeSessions.length).toBe(before);
  });

  it('CGV cochées : paiement ouvert, acceptation datée sur la session et sur l\'abonnement', async () => {
    const res = await subscribe.POST(req('/api/subscription/checkout', { body: { acceptedTerms: true } }));
    expect(res.status).toBe(200);
    const params = sent.stripeSessions.at(-1) as { mode: string; metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } };
    expect(params.mode).toBe('subscription');
    expect(params.metadata.termsAcceptedAt).toBeTruthy();
    expect(params.subscription_data.metadata.termsAcceptedAt).toBe(params.metadata.termsAcceptedAt);
    customerId = member('stripe_customer_id');
    expect(customerId).toMatch(/^cus_/);
  });

  it('abonnement annoncé avant la fin du checkout, puis rejeu : premium, un seul email de bienvenue', async () => {
    stripeState.subs.push({ id: subId, customer: customerId, status: 'active' });
    const completed = () => stripeEvent('checkout.session.completed', {
      id: `cs_prem_${sent.run}`, mode: 'subscription', subscription: subId, customer: customerId, metadata: { memberId: wearer.memberId },
    });
    expect((await webhook.POST(stripeEvent('customer.subscription.updated', subscription({})))).status).toBe(200);
    expect((await webhook.POST(completed())).status).toBe(200);
    expect((await webhook.POST(completed())).status).toBe(200);
    expect(member('plan, stripe_subscription_id')).toBe(`premium|${subId}`);
    const welcome = toWearer('bienvenue dans le cercle premium');
    expect(welcome).toHaveLength(1);
    expect(welcome[0].html).toContain('remboursé en entier');
  });

  it('nouveau clic sur « Passer premium » : déjà abonné, signalé comme tel', async () => {
    const res = await subscribe.POST(req('/api/subscription/checkout', { body: { acceptedTerms: true } }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('already_subscribed');
  });

  it('résiliation programmée : date de fin posée, confirmation envoyée une seule fois', async () => {
    const cancelled = () => stripeEvent('customer.subscription.updated', subscription({
      cancel_at: END, cancel_at_period_end: true, items: { data: [{ current_period_end: END }] },
    }));
    expect((await webhook.POST(cancelled())).status).toBe(200);
    expect((await webhook.POST(cancelled())).status).toBe(200);
    expect(member(`plan, to_char(plan_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)).toBe('premium|2026-11-22');
    const confirmation = toWearer('votre résiliation est enregistrée');
    expect(confirmation).toHaveLength(1);
    expect(confirmation[0].html.replace(/\s+/g, ' ')).toContain('jusqu’au 22 novembre 2026');
  });

  it('résiliation annulée depuis le portail : la date de fin disparaît', async () => {
    expect((await webhook.POST(stripeEvent('customer.subscription.updated', subscription({})))).status).toBe(200);
    expect(member(`plan, coalesce(plan_expires_at::text, 'aucune')`)).toBe('premium|aucune');
  });

  it('fin de l\'abonnement, puis rejeu : gratuit, un seul email de fin', async () => {
    stripeState.subs.find(s => s.id === subId)!.status = 'canceled';
    const deleted = () => stripeEvent('customer.subscription.deleted', subscription({ status: 'canceled', ended_at: END }));
    expect((await webhook.POST(deleted())).status).toBe(200);
    expect((await webhook.POST(deleted())).status).toBe(200);
    expect(member(`plan, coalesce(stripe_subscription_id, 'aucun')`)).toBe('free|aucun');
    expect(toWearer('a pris fin')).toHaveLength(1);
  });

  it('suppression du compte, Stripe injoignable : 502, le compte reste', async () => {
    // Réabonné, mais le webhook n'est pas encore passé : la base ignore l'abonnement.
    stripeState.subs.push({ id: `${subId}b`, customer: customerId, status: 'active' });
    stripeState.failCancel = true;
    const res = await remove.DELETE(req('/api/member/delete', { method: 'DELETE' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('votre compte n\'a pas été supprimé');
    expect(member('name')).toBe('Camille');
  });

  it('suppression du compte : tout abonnement actif du client est résilié, confirmé par email', async () => {
    stripeState.failCancel = false;
    const res = await remove.DELETE(req('/api/member/delete', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(stripeState.cancelled).toEqual([`${subId}b`]);
    expect(toWearer('votre abonnement premium est résilié')).toHaveLength(1);
    expect(sql(`SELECT count(*) FROM members WHERE id = '${wearer.memberId}'`)).toBe('0');
  });
});

// ─── Administration de la modération (/admin) ─────────────────────────────────
describe.skipIf(!ENABLED)('Administration : un signalement traité depuis /admin', () => {
  let admin:  typeof import('@/app/api/admin/moderation/route');
  let report: typeof import('@/app/api/profile/report/route');
  let queue:  typeof import('@/lib/moderation-queue');
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const wearerEmail = `adm-${wearer.authId}@example.com`;
  const ADMIN = { id: crypto.randomUUID(), email: 'clement@example.com', email_confirmed_at: new Date().toISOString() };
  const decide = (body: Record<string, unknown>) => admin.POST(req('/api/admin/moderation', { body }));
  const mailsTo = (to: string, subject: string) => sent.emails.filter(e => e.to[0] === to && e.subject === subject);
  // audit() écrit en tâche de fond : on attend la ligne.
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise(r => setTimeout(r, 100));
  };

  beforeAll(async () => {
    process.env.ADMIN_EMAILS = 'clement@example.com';
    admin  = await import('@/app/api/admin/moderation/route');
    report = await import('@/app/api/profile/report/route');
    queue  = await import('@/lib/moderation-queue');
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', '${wearerEmail}', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Porteur', '${wearerEmail}')`);
  });

  it('le signalement apparaît dans la file, avec son motif et son auteur', async () => {
    currentUser = null;
    const res = await report.POST(req('/api/profile/report', {
      body: { memberId: wearer.memberId, reason: 'Présentation insultante.', contact: 'temoin@example.com', goodFaith: true },
    }));
    expect(await res.json()).toEqual({ ok: true, receiptSent: true });
    await until(() => sql(`SELECT count(*) FROM audit_logs WHERE action = 'profile.reported' AND member_id = '${wearer.memberId}'`) === '1');
    const item = (await queue.loadModerationQueue()).profileReports.find(r => r.member?.id === wearer.memberId);
    expect(item).toEqual(expect.objectContaining({ reason: 'Présentation insultante.', contact: 'temoin@example.com' }));
  });

  it('un compte qui n’est pas dans ADMIN_EMAILS est refusé (404), rien ne change', async () => {
    currentUser = { id: wearer.authId, email: wearerEmail, email_confirmed_at: new Date().toISOString() };
    const res = await decide({ action: 'suspend_member', memberId: wearer.memberId, motif: 'Présentation insultante' });
    expect(res.status).toBe(404);
    expect(sql(`SELECT suspended_at IS NULL FROM members WHERE id = '${wearer.memberId}'`)).toBe('t');
  });

  it('suspendre : profil suspendu, décision tracée, signalement clos, porteur et auteur prévenus', async () => {
    currentUser = ADMIN;
    const reportId = sql(`SELECT id FROM audit_logs WHERE action = 'profile.reported' AND member_id = '${wearer.memberId}'`);
    const res = await decide({
      action: 'suspend_member', memberId: wearer.memberId, motif: 'Présentation insultante',
      reportKey: `profile:${reportId}`, notifyReporter: true,
    });
    expect(await res.json()).toEqual({ ok: true, memberNotified: true, reporterNotified: true });
    expect(sql(`SELECT is_paused || '|' || (suspended_at IS NOT NULL) FROM members WHERE id = '${wearer.memberId}'`)).toBe('true|true');
    expect(sql(`SELECT metadata->>'by' FROM audit_logs WHERE action = 'member.suspended' AND member_id = '${wearer.memberId}'`)).toBe('clement@example.com');
    expect(mailsTo(wearerEmail, 'Votre profil In Real Society est suspendu')).toHaveLength(1);
    expect(mailsTo('temoin@example.com', 'Suite de votre signalement')).toHaveLength(1);

    const q = await queue.loadModerationQueue();
    expect(q.profileReports.find(r => r.key === `profile:${reportId}`)).toBeUndefined();
    expect(q.suspended.map(m => m.id)).toContain(wearer.memberId);
    expect(q.decisions.map(d => d.action)).toEqual(expect.arrayContaining(['member.suspended', 'moderation.report_handled']));
  });

  it('lever la suspension : profil rétabli, porteur prévenu', async () => {
    expect((await decide({ action: 'unsuspend_member', memberId: wearer.memberId })).status).toBe(200);
    expect(sql(`SELECT is_paused || '|' || (suspended_at IS NULL) FROM members WHERE id = '${wearer.memberId}'`)).toBe('false|true');
    expect(mailsTo(wearerEmail, 'Votre profil In Real Society est rétabli')).toHaveLength(1);
  });
});

describe.skipIf(!ENABLED)('Administration : chiffres, commandes à surveiller, recherche', () => {
  let watch: typeof import('@/lib/order-watch');
  let stats: typeof import('@/lib/field-stats');
  let admin: typeof import('@/app/api/admin/moderation/route');
  const tag     = crypto.randomUUID().slice(0, 8);
  const wearer  = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const orderId = crypto.randomUUID();
  const code    = `Z${tag.toUpperCase().slice(0, 7)}`;
  const buyer   = `achat-${tag}@example.com`;

  beforeAll(async () => {
    process.env.ADMIN_EMAILS = 'clement@example.com';
    watch = await import('@/lib/order-watch');
    stats = await import('@/lib/field-stats');
    admin = await import('@/app/api/admin/moderation/route');
    // Porteur activé il y a 40 jours, scanné il y a 3 jours ; commande payée il y
    // a 10 jours, jamais imprimée, code jamais utilisé.
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', 'ines-${tag}@example.com', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email, created_at) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Ines${tag}', 'ines-${tag}@example.com', now() - interval '40 days')`);
    sql(`INSERT INTO scans (member_id, scanned_at) VALUES ('${wearer.memberId}', now() - interval '3 days')`);
    sql(`INSERT INTO activation_codes (code, used) VALUES ('${code}', false)`);
    sql(`INSERT INTO orders (id, email, status, activation_code, created_at) VALUES ('${orderId}', '${buyer}', 'paid', '${code}', now() - interval '10 days')`);
  });

  it('recherche par prénom, par email et par code d’activation', async () => {
    expect((await watch.searchAdmin(`ines${tag}`))!.members.map(m => m.id)).toContain(wearer.memberId);
    const byEmail = await watch.searchAdmin(`achat-${tag}`);
    expect(byEmail!.orders.map(o => o.id)).toEqual([orderId]);
    expect(byEmail!.orders[0]).toEqual(expect.objectContaining({ code, codeUsed: false, printed: false, status: 'paid' }));
    expect((await watch.searchAdmin(code.toLowerCase()))!.orders.map(o => o.id)).toEqual([orderId]);
  });

  it('commandes à surveiller : pas imprimée, code non utilisé depuis 10 jours', async () => {
    const list = await watch.loadOrderWatch();
    expect(list.unprinted.map(o => o.id)).toContain(orderId);
    expect(list.notActivated.map(o => o.id)).toContain(orderId);
  });

  it('chiffres du test : le porteur ancien et scanné compte comme encore porté', async () => {
    const s = await stats.loadFieldStats();
    expect(s.wearers).toBeGreaterThanOrEqual(1);
    expect(s.stillWorn.hit).toBeGreaterThanOrEqual(1);
    expect(s.stillWorn.hit).toBeLessThanOrEqual(s.stillWorn.eligible);
    expect(s.funnel.scans).toBeGreaterThanOrEqual(1);
  });

  it('renvoyer le code depuis /admin : email à l’acheteur, tracé', async () => {
    currentUser = { id: crypto.randomUUID(), email: 'clement@example.com', email_confirmed_at: new Date().toISOString() };
    const res = await admin.POST(req('/api/admin/moderation', { body: { action: 'resend_code', orderId } }));
    expect(await res.json()).toEqual(expect.objectContaining({ ok: true, buyerNotified: true }));
    expect(sent.emails.filter(e => e.to[0] === buyer)).toHaveLength(1);
    expect(sql(`SELECT count(*) FROM audit_logs WHERE action = 'order.email_resent' AND metadata->>'orderId' = '${orderId}'`)).toBe('1');
  });
});


// ─── Notifications mesurées (062) ────────────────────────────────────────────
describe.skipIf(!ENABLED)('Notifications : abonnements des porteurs gardés, téléphone relevé, chiffres de /admin', () => {
  let push:  typeof import('@/app/api/push/subscribe/route');
  let phone: typeof import('@/lib/phone');
  let watch: typeof import('@/lib/order-watch');
  let stats: typeof import('@/lib/field-stats');
  const tag    = crypto.randomUUID().slice(0, 8);
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const root   = crypto.randomUUID();   // conversation de ces jours-ci
  const ep = {
    wearer:   `https://web.push.apple.com/porteur-${tag}`,
    passant:  `https://fcm.googleapis.com/fcm/send/passant-${tag}`,
    resubbed: `https://fcm.googleapis.com/fcm/send/reabonne-${tag}`,
  };
  const IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const kept = (endpoint: string) => sql(`SELECT count(*) FROM push_subscriptions WHERE endpoint = '${endpoint}'`);

  beforeAll(async () => {
    push  = await import('@/app/api/push/subscribe/route');
    phone = await import('@/lib/phone');
    watch = await import('@/lib/order-watch');
    stats = await import('@/lib/field-stats');
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', 'lou-${tag}@example.com', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${wearer.memberId}', '${wearer.authId}', 'Lou${tag}', 'lou-${tag}@example.com')`);
    sql(`INSERT INTO messages (id, member_id, content, author) VALUES ('${root}', '${wearer.memberId}', 'Bonjour', 'scanner')`);
    // Abonnés il y a 4 mois : l'iPhone du porteur, et deux appareils de passants.
    sql(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, member_id, created_at) VALUES ('${ep.wearer}', 'p', 'a', '${wearer.memberId}', now() - interval '120 days')`);
    sql(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, message_id, created_at) VALUES
      ('${ep.passant}', 'p', 'a', '${crypto.randomUUID()}', now() - interval '120 days'),
      ('${ep.resubbed}', 'p', 'a', '${crypto.randomUUID()}', now() - interval '120 days')`);
  });

  it('un passant suit une nouvelle conversation depuis le même appareil : ses 90 jours repartent', async () => {
    const body = { subscription: { endpoint: ep.resubbed, keys: { p256dh: 'p2', auth: 'a2' } }, messageId: root };
    expect((await push.POST(req('/api/push/subscribe', { body }))).status).toBe(200);
    expect(sql(`SELECT message_id || '|' || (created_at > now() - interval '1 minute') FROM push_subscriptions WHERE endpoint = '${ep.resubbed}'`))
      .toBe(`${root}|true`);
  });

  it('purge : l’abonnement du porteur reste au-delà de 90 jours, celui du passant part', () => {
    expect(Number(sql(`SELECT push_subscriptions_deleted FROM cleanup_old_data()`))).toBeGreaterThanOrEqual(1);
    expect(kept(ep.wearer)).toBe('1');
    expect(kept(ep.passant)).toBe('0');
    expect(kept(ep.resubbed)).toBe('1');
  });

  it('« Mon espace » ouvert depuis l’app sur iPhone : téléphone et première ouverture relevés', async () => {
    // Profil lu comme « Mon espace » le lit : get_own_member() renvoie aussi les
    // colonnes ajoutées après sa création.
    const res = await realFetch(`${POSTGREST_URL}/rpc/get_own_member`, {
      method: 'POST', body: '{}',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signJwt({ role: 'authenticated', sub: wearer.authId })}` },
    });
    const member = await res.json();
    expect(member).toEqual(expect.objectContaining({ id: wearer.memberId, phone_os: null, app_installed_at: null }));
    phone.recordPhone(member, IPHONE_APP, true);
    await vi.waitFor(() => {
      expect(sql(`SELECT phone_os || '|' || (app_installed_at IS NOT NULL) FROM members WHERE id = '${wearer.memberId}'`)).toBe('ios|true');
    });
  });

  it('/admin : chiffres et recherche disent qui est prévenu, sur quel téléphone', async () => {
    const s = (await stats.loadFieldStats()).notifications;
    expect(s.phones!.iphone.installed).toBeGreaterThanOrEqual(1);
    expect(s.phones!.iphone.notified).toBeGreaterThanOrEqual(1);
    expect(s.wearers.apple).toBeGreaterThanOrEqual(1);
    expect(s.followed).toBeGreaterThanOrEqual(1);
    const hit = (await watch.searchAdmin(`lou${tag}`))!.members.find(m => m.id === wearer.memberId)!;
    expect(hit.pushServices).toEqual(['apple']);
    expect(hit.phone).toEqual({ os: 'ios', appInstalledAt: expect.any(String) });
  });

  it('déconnexion : l’appareil du porteur est désabonné, même sans session', async () => {
    currentUser = null;
    const res = await push.DELETE(req('/api/push/subscribe', { method: 'DELETE', body: { endpoint: ep.wearer } }));
    expect(res.status).toBe(200);
    expect(kept(ep.wearer)).toBe('0');
    expect((await watch.searchAdmin(`lou${tag}`))!.members[0].pushServices).toEqual([]);
  });
});

// ─── Test terrain : semaine par semaine, suivi des porteurs, avis ────────────
describe.skipIf(!ENABLED)('Test terrain : semaine par semaine, suivi des porteurs, avis dans /admin', () => {
  let stats:    typeof import('@/lib/field-stats');
  let digest:   typeof import('@/lib/feedback-digest');
  let feedback: typeof import('@/app/api/feedback/route');
  const tag    = crypto.randomUUID().slice(0, 8);
  const wearer = { authId: crypto.randomUUID(), memberId: crypto.randomUUID() };
  const other  = crypto.randomUUID();   // un autre porteur, au nom duquel on tenterait d'écrire
  const root   = crypto.randomUUID();
  const note   = `Les notifications arrivent bien (${tag}).`;

  beforeAll(async () => {
    stats    = await import('@/lib/field-stats');
    digest   = await import('@/lib/feedback-digest');
    feedback = await import('@/app/api/feedback/route');
    // Porteur activé à l'instant (le plus récent : le suivi en garde 50), scanné ;
    // un passant écrit, le porteur répond, puis note la conversation.
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${wearer.authId}', 'sam-${tag}@example.com', now())`);
    sql(`INSERT INTO members (id, auth_user_id, name, email, short_code)
         VALUES ('${wearer.memberId}', '${wearer.authId}', 'Sam${tag}', 'sam-${tag}@example.com', '${tag.slice(0, 6)}')`);
    sql(`INSERT INTO scans (member_id) VALUES ('${wearer.memberId}')`);
    sql(`INSERT INTO messages (id, member_id, content, author) VALUES ('${root}', '${wearer.memberId}', 'Bonjour', 'scanner')`);
    sql(`INSERT INTO messages (member_id, parent_id, content, author) VALUES ('${wearer.memberId}', '${root}', 'Salut !', 'member')`);
    sql(`INSERT INTO feedback (type, rating, message_id) VALUES ('conversation', 'positive', '${root}')`);
  });

  it('« Votre avis » : rattaché au porteur connecté, pas à l’identifiant envoyé', async () => {
    currentUser = { id: wearer.authId, email: `sam-${tag}@example.com` };
    const res = await feedback.POST(req('/api/feedback', { body: { type: 'app', message: note, memberId: other } }));
    currentUser = null;
    expect(res.status).toBe(200);
    expect(sql(`SELECT member_id FROM feedback WHERE message = '${note}'`)).toBe(wearer.memberId);
  });

  it('suivi : le porteur, ses scans, ses messages et ses réponses', async () => {
    const s = await stats.loadFieldStats();
    expect(s.followUp.find((w) => w.id === wearer.memberId)).toEqual(expect.objectContaining({
      name: `Sam${tag}`, shortCode: tag.slice(0, 6), days: 0, state: 'active',
      scans: 1, recentScans: 1, lastScanAt: expect.any(String), messages: 1, replied: 1, notified: false,
    }));
  });

  it('semaine par semaine : 8 semaines, le scan et la conversation de ces jours-ci comptés', async () => {
    const weeks = (await stats.loadFieldStats()).weeks;
    expect(weeks).toHaveLength(stats.WEEKS);
    const thisWeek = weeks.find((w) => w.start === stats.parisWeekStart(Date.now()))!;
    expect(thisWeek.scanned).toBeGreaterThanOrEqual(1);
    expect(thisWeek.messages).toBeGreaterThanOrEqual(1);
    expect(thisWeek.replied).toBeGreaterThanOrEqual(1);
    expect(thisWeek.scanned).toBeLessThanOrEqual(thisWeek.wearers);
  });

  it('avis : l’écrit, avec son porteur ; la note de fin de conversation comptée', async () => {
    const d = await digest.loadFeedbackDigest();
    expect(d.notes.find((n) => n.message === note)).toEqual(expect.objectContaining({ member: { id: wearer.memberId, name: `Sam${tag}` } }));
    expect(d.ratings.positive).toBeGreaterThanOrEqual(1);
  });
});
