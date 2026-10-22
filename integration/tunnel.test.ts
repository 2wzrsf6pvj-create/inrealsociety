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
    expect(html).toMatch(/59,00\s€ TTC/);
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
    const res = await shortRedirect.GET(req(`/r/${shortCode}`, { method: 'GET' }), { params: { code: shortCode } });
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
    expect(res.status).toBe(403);   // même réponse que « indisponible » : le ban n'est pas révélé
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
