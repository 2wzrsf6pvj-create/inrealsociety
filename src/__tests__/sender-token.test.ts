// Jeton de device du scanneur : on n'accepte que des UUID (jamais une valeur
// arbitraire venue du cookie), et getSenderToken ne doit jamais throw même si
// la requête n'a pas de cookies.

import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  createSenderToken,
  isValidSenderToken,
  getSenderToken,
  SENDER_TOKEN_COOKIE,
} from '@/lib/sender-token';

describe('sender-token', () => {
  it('createSenderToken génère un UUID valide', () => {
    const t = createSenderToken();
    expect(isValidSenderToken(t)).toBe(true);
    // Deux appels successifs ne collisionnent pas.
    expect(createSenderToken()).not.toBe(t);
  });

  it('isValidSenderToken rejette tout ce qui n\'est pas un UUID', () => {
    expect(isValidSenderToken(createSenderToken())).toBe(true);
    expect(isValidSenderToken('')).toBe(false);
    expect(isValidSenderToken('not-a-uuid')).toBe(false);
    expect(isValidSenderToken('11111111-1111-1111-1111')).toBe(false);
    expect(isValidSenderToken("'; DROP TABLE blocks; --")).toBe(false);
    expect(isValidSenderToken(undefined)).toBe(false);
    expect(isValidSenderToken(null)).toBe(false);
    expect(isValidSenderToken(42)).toBe(false);
  });

  it('getSenderToken lit un cookie valide', () => {
    const token = createSenderToken();
    const req = { cookies: { get: (n: string) => n === SENDER_TOKEN_COOKIE ? { value: token } : undefined } } as unknown as NextRequest;
    expect(getSenderToken(req)).toBe(token);
  });

  it('getSenderToken renvoie null pour un cookie absent, invalide, ou sans cookies', () => {
    const absent  = { cookies: { get: () => undefined } } as unknown as NextRequest;
    const invalid = { cookies: { get: () => ({ value: 'pas-un-uuid' }) } } as unknown as NextRequest;
    const noCookies = {} as unknown as NextRequest; // ne doit pas throw
    expect(getSenderToken(absent)).toBeNull();
    expect(getSenderToken(invalid)).toBeNull();
    expect(getSenderToken(noCookies)).toBeNull();
  });
});
