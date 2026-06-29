// Tests de la garde d'annulation Printful (cancelPrintfulOrder).
//
// Invariant critique : on n'envoie un DELETE à Printful QUE si la commande est
// encore annulable (draft/pending/onhold/failed). Une commande en prod/expédiée
// ne doit JAMAIS recevoir de DELETE (échec garanti + faux signal). Fail-soft :
// la fonction ne throw jamais, elle renvoie un CancelResult auditable.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelPrintfulOrder } from '@/lib/printful-status';

// fetch est appelé 2× au plus : GET (statut) puis DELETE (annulation).
// Le mock route selon la méthode pour pouvoir asserter qu'aucun DELETE ne part
// sur un statut non annulable.
function mockFetchByStatus(status: string) {
  return vi.fn((_url: string, opts?: { method?: string }) => {
    if (opts?.method === 'DELETE') {
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') });
    }
    // GET statut
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: { status } }) });
  });
}

describe('cancelPrintfulOrder', () => {
  beforeEach(() => {
    process.env.PRINTFUL_API_TOKEN = 'test-token';
    vi.restoreAllMocks();
  });

  it('annule (DELETE) une commande encore en amont de la prod', async () => {
    const fetchMock = mockFetchByStatus('pending');
    vi.stubGlobal('fetch', fetchMock);

    const res = await cancelPrintfulOrder('123');

    expect(res.canceled).toBe(true);
    const calledDelete = fetchMock.mock.calls.some(([, opts]) => (opts as { method?: string })?.method === 'DELETE');
    expect(calledDelete).toBe(true);
  });

  it("n'envoie AUCUN DELETE si la commande est déjà en production", async () => {
    const fetchMock = mockFetchByStatus('inprocess');
    vi.stubGlobal('fetch', fetchMock);

    const res = await cancelPrintfulOrder('123');

    expect(res.canceled).toBe(false);
    expect(res.reason).toBe('not_cancellable');
    expect(res.status).toBe('inprocess');
    const calledDelete = fetchMock.mock.calls.some(([, opts]) => (opts as { method?: string })?.method === 'DELETE');
    expect(calledDelete).toBe(false);
  });

  it('idempotent : déjà canceled → canceled:true sans DELETE', async () => {
    const fetchMock = mockFetchByStatus('canceled');
    vi.stubGlobal('fetch', fetchMock);

    const res = await cancelPrintfulOrder('123');

    expect(res.canceled).toBe(true);
    const calledDelete = fetchMock.mock.calls.some(([, opts]) => (opts as { method?: string })?.method === 'DELETE');
    expect(calledDelete).toBe(false);
  });

  it('fail-soft : sans token, ne touche pas le réseau', async () => {
    delete process.env.PRINTFUL_API_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await cancelPrintfulOrder('123');

    expect(res.canceled).toBe(false);
    expect(res.reason).toBe('no_token_or_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
