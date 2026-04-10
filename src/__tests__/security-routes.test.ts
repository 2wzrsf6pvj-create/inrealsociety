// src/__tests__/security-routes.test.ts
// Tests de sécurité structurels — vérifie que toutes les routes API
// respectent les invariants de sécurité du projet.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const API_DIR = path.resolve(__dirname, '../app/api');

/** Récupère récursivement tous les route.ts dans src/app/api/ */
function getAllRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllRouteFiles(full));
    } else if (entry.name === 'route.ts') {
      results.push(full);
    }
  }
  return results;
}

/** Routes publiques qui n'ont PAS besoin d'auth (par design) */
const PUBLIC_ROUTES = [
  'api/message',
  'api/scan',
  'api/silent-view',
  'api/activate',
  'api/order-code',
  'api/push/subscribe',
];

/** Routes protégées par un secret header (pas par session) */
const SECRET_PROTECTED_ROUTES = [
  'api/push/notify',      // INTERNAL_SECRET
  'api/member/migrate',   // ADMIN_SECRET
];

/** Routes webhook (protégées par signature) */
const WEBHOOK_ROUTES = [
  'api/webhook/stripe',
];

function getRouteKey(filePath: string): string {
  return path.relative(API_DIR, path.dirname(filePath)).replace(/\\/g, '/');
}

function isPublicRoute(routeKey: string): boolean {
  return PUBLIC_ROUTES.some(r => routeKey === r.replace('api/', ''));
}

function isSecretRoute(routeKey: string): boolean {
  return SECRET_PROTECTED_ROUTES.some(r => routeKey === r.replace('api/', ''));
}

function isWebhookRoute(routeKey: string): boolean {
  return WEBHOOK_ROUTES.some(r => routeKey === r.replace('api/', ''));
}

const routeFiles = getAllRouteFiles(API_DIR);

describe('Sécurité des routes API', () => {

  it('devrait trouver au moins 15 routes API', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(15);
  });

  describe('Authentification', () => {
    for (const file of routeFiles) {
      const routeKey = getRouteKey(file);
      const content = fs.readFileSync(file, 'utf-8');

      if (isPublicRoute(routeKey) || isWebhookRoute(routeKey)) continue;

      if (isSecretRoute(routeKey)) {
        it(`${routeKey} — devrait vérifier un secret header`, () => {
          const hasSecret = content.includes('INTERNAL_SECRET') || content.includes('ADMIN_SECRET');
          expect(hasSecret).toBe(true);
        });
        continue;
      }

      it(`${routeKey} — devrait utiliser requireAuth`, () => {
        expect(content).toContain('requireAuth');
      });
    }
  });

  describe('Pas de mutation via client anon', () => {
    for (const file of routeFiles) {
      const routeKey = getRouteKey(file);
      const content = fs.readFileSync(file, 'utf-8');

      // Vérifie qu'aucune route n'utilise le client anon pour des mutations
      const usesAnonClient = content.includes("from '@/lib/supabase'");
      const hasMutation = /await supabase\.(from\(.+\)\.(insert|update|delete|upsert)|rpc)/.test(content);

      it(`${routeKey} — ne devrait pas faire de mutation avec le client anon`, () => {
        if (usesAnonClient && hasMutation) {
          expect.fail(`${routeKey} utilise le client anon pour des mutations`);
        }
      });
    }
  });

  describe('Validation des entrées', () => {
    for (const file of routeFiles) {
      const routeKey = getRouteKey(file);
      const content = fs.readFileSync(file, 'utf-8');

      // Skip webhook (validé par signature Stripe)
      if (isWebhookRoute(routeKey)) continue;
      // Skip migrate (admin one-shot)
      if (routeKey === 'member/migrate') continue;

      it(`${routeKey} — devrait avoir une validation Zod ou équivalente`, () => {
        const hasZod = content.includes('z.object') || content.includes('z.string');
        const hasManualValidation = content.includes('safeParse') || content.includes('.uuid()');
        const hasFormDataValidation = content.includes('formData') && content.includes('ALLOWED_TYPES');
        expect(hasZod || hasManualValidation || hasFormDataValidation).toBe(true);
      });
    }
  });

  describe('Rate limiting', () => {
    for (const file of routeFiles) {
      const routeKey = getRouteKey(file);
      const content = fs.readFileSync(file, 'utf-8');

      // Skip routes qui n'ont pas besoin de rate limiting
      if (isWebhookRoute(routeKey)) continue;
      if (isSecretRoute(routeKey)) continue; // push/notify, member/migrate — protégés par secret
      if (['activate', 'order-code', 'member/avatar'].includes(routeKey)) continue;

      it(`${routeKey} — devrait avoir du rate limiting`, () => {
        const hasRateLimit = content.includes('Ratelimit') ||
          content.includes('checkAuthRateLimit') ||
          content.includes('checkMessageRateLimit') ||
          content.includes('checkScanRateLimit') ||
          content.includes('checkPublicRateLimit') ||
          content.includes('limitReferralByIp');
        expect(hasRateLimit).toBe(true);
      });
    }
  });
});
