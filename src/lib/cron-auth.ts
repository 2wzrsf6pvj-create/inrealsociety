// Authentification des crons Vercel (CRON_SECRET via Authorization: Bearer ou
// x-cron-secret). Comparaison constant-time (timingSafeEqual) plutôt que ===,
// et fail-closed si CRON_SECRET absent. Source unique pour les 3 crons.

import type { NextRequest } from 'next/server';
import crypto from 'crypto';

export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
                 ?? req.headers.get('x-cron-secret')
                 ?? '';
  if (provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}
