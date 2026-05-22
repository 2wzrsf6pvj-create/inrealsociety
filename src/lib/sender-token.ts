// src/lib/sender-token.ts
// Jeton de device pseudonyme pour le scanneur anonyme. Posé en cookie httpOnly
// au premier message, il sert UNIQUEMENT à la sécurité : permettre à un porteur
// de bloquer un scanneur au-delà d'une seule conversation (anti-harcèlement,
// intérêt légitime art. 6.1.f RGPD). Jamais utilisé pour l'analytics.
//
// httpOnly → invisible au JS (pas de spoof trivial, pas de surface XSS).
// Limite assumée : effacer ses cookies / navigation privée le réinitialise.

import type { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const SENDER_TOKEN_COOKIE = 'irs_sender';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Génère un nouveau jeton (UUID v4). */
export function createSenderToken(): string {
  return crypto.randomUUID();
}

/** Valide le format d'un jeton — on n'accepte que des UUID, jamais de valeur arbitraire. */
export function isValidSenderToken(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Lit le jeton depuis le cookie de la requête, ou null s'il est absent/invalide. */
export function getSenderToken(req: NextRequest): string | null {
  const raw = req.cookies?.get?.(SENDER_TOKEN_COOKIE)?.value;
  return isValidSenderToken(raw) ? raw : null;
}

/** Pose le cookie de jeton sur la réponse (httpOnly, 1 an). */
export function setSenderTokenCookie(res: NextResponse, token: string): void {
  res.cookies.set(SENDER_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   60 * 60 * 24 * 365, // 1 an
  });
}
