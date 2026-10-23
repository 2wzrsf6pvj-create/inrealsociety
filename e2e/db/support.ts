// e2e/db/support.ts — E2E avec base : adresses, clés, session simulée, accès SQL.
// Même base de test que les tests d'intégration (integration/README.md) ; la
// passerelle (supabase-gateway.mjs) se fait passer pour Supabase devant elle.

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Browser, BrowserContext } from '@playwright/test';

export const DB_URL        = process.env.INTEGRATION_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/irs_it';
export const POSTGREST_URL = process.env.INTEGRATION_POSTGREST_URL ?? 'http://localhost:3001';
export const JWT_SECRET    = process.env.INTEGRATION_JWT_SECRET ?? 'integration-test-secret-integration-test-secret';
export const GATEWAY_PORT  = 54321;
export const APP_PORT      = 3100;
export const GATEWAY_URL   = `http://localhost:${GATEWAY_PORT}`;
export const APP_URL       = `http://localhost:${APP_PORT}`;
export const ADMIN_EMAIL   = 'admin-e2e@example.com';

export function signJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')}`;
}

/** Variables de l'app, à la construction comme au lancement : Supabase et
 *  Upstash pointent sur la passerelle. */
export const APP_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL:      GATEWAY_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: signJwt({ role: 'anon', iss: 'e2e' }),
  SUPABASE_SERVICE_ROLE_KEY:     signJwt({ role: 'service_role', iss: 'e2e' }),
  NEXT_PUBLIC_APP_URL:           APP_URL,
  UPSTASH_REDIS_REST_URL:        `${GATEWAY_URL}/upstash`,
  UPSTASH_REDIS_REST_TOKEN:      'e2e',
  ADMIN_EMAILS:                  ADMIN_EMAIL,
};

export function sql(query: string): string {
  return execFileSync('psql', [DB_URL, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}

export interface Account { id: string; email: string }
export interface Wearer extends Account { memberId: string; name: string }

/** Porteur au compte confirmé, prénom unique (recherche de /admin). */
export function createWearer(firstName: string): Wearer {
  const id = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const name = `${firstName}${id.slice(0, 6)}`;
  const email = `${name.toLowerCase()}@example.com`;
  sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${id}', '${email}', now())`);
  sql(`INSERT INTO members (id, auth_user_id, name, email) VALUES ('${memberId}', '${id}', '${name}', '${email}')`);
  return { id, email, memberId, name };
}

/** Contexte de navigateur : la CSP de production n'autorise pas la base de
 *  test, qui répond sur localhost. */
export function newContext(browser: Browser, options: { userAgent?: string; viewport?: { width: number; height: number } } = {}) {
  return browser.newContext({ baseURL: APP_URL, bypassCSP: true, ...options });
}

/** Connecté comme après la page de connexion : session Supabase dans le cookie
 *  de @supabase/ssr. Bandeau des cookies et présentation de « Mon espace »
 *  déjà vus. */
export async function logIn(context: BrowserContext, account: Account): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: account.id, email: account.email, aud: 'authenticated', role: 'authenticated',
    email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
  };
  const session = {
    access_token: signJwt({ sub: account.id, email: account.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600 }),
    refresh_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user,
  };
  await context.addCookies([
    { name: 'sb-localhost-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: APP_URL },
    { name: 'irs_consent_set', value: '1', url: APP_URL },
  ]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('irs_consent', 'denied');
      localStorage.setItem('irs_onboarding_v1', '1');
    } catch { /* stockage indisponible : sans effet sur les tests */ }
  });
}
