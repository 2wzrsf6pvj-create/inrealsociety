// Token HMAC de désinscription : on ne doit pas pouvoir désabonner un email
// arbitraire sans le token signé.

import { describe, it, expect } from 'vitest';
import { signUnsubscribe, verifyUnsubscribe } from '@/lib/unsubscribe-token';

describe('unsubscribe-token', () => {
  it('accepte un token valide', () => {
    const t = signUnsubscribe('a@b.com');
    expect(verifyUnsubscribe('a@b.com', t)).toBe(true);
  });

  it('normalise casse + espaces', () => {
    const t = signUnsubscribe('A@B.com');
    expect(verifyUnsubscribe('  a@b.com ', t)).toBe(true);
  });

  it('rejette token invalide, email différent, ou vide', () => {
    const t = signUnsubscribe('a@b.com');
    expect(verifyUnsubscribe('autre@b.com', t)).toBe(false);
    expect(verifyUnsubscribe('a@b.com', 'deadbeef')).toBe(false);
    expect(verifyUnsubscribe('a@b.com', '')).toBe(false);
    expect(verifyUnsubscribe('', t)).toBe(false);
  });
});
