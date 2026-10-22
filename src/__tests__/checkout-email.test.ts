// Email saisi en boutique, gardé en sessionStorage pour pré-remplir l'activation.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { rememberCheckoutEmail, recallCheckoutEmail, forgetCheckoutEmail } from '@/lib/checkout-email';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem:    (k: string) => m.get(k) ?? null,
    setItem:    (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('checkout-email', () => {
  it('garde, relit puis oublie l\'email', () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    expect(recallCheckoutEmail()).toBeNull();
    rememberCheckoutEmail('jeanne@example.com');
    expect(recallCheckoutEmail()).toBe('jeanne@example.com');
    forgetCheckoutEmail();
    expect(recallCheckoutEmail()).toBeNull();
  });

  it('stockage bloqué (navigation privée) : aucune exception, rien de relu', () => {
    const blocked = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => rememberCheckoutEmail('jeanne@example.com')).not.toThrow();
    expect(recallCheckoutEmail()).toBeNull();
    expect(() => forgetCheckoutEmail()).not.toThrow();
  });

  it('sans sessionStorage (rendu serveur) : aucune exception', () => {
    vi.stubGlobal('sessionStorage', undefined);
    expect(() => rememberCheckoutEmail('jeanne@example.com')).not.toThrow();
    expect(recallCheckoutEmail()).toBeNull();
  });
});
