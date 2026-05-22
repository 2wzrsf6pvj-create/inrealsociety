// Tests de la déduplication de scan (isNewScan).
// Invariants critiques :
//   1. IP inconnue ('anonymous'/vide) → on NE déduplique PAS (sinon tous les
//      scanneurs sans IP partageraient un bucket → faux doublons). Et on ne
//      touche même pas Redis.
//   2. Panne Redis → fail-open (on compte le scan) pour rester best-effort.
//   3. Comportement nominal : suit le verdict du limiteur fixedWindow(1, 30m).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static fixedWindow() { return {}; }
    static slidingWindow() { return {}; }
    limit = limitMock;
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {},
}));

import { isNewScan } from '@/lib/ratelimit';

describe('isNewScan — déduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockReset();
  });

  it("laisse passer (true) sans toucher Redis quand l'IP est 'anonymous'", async () => {
    const res = await isNewScan('member-1', 'anonymous');
    expect(res).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("laisse passer (true) sans toucher Redis quand l'IP est vide", async () => {
    const res = await isNewScan('member-1', '');
    expect(res).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('renvoie true (scan neuf) quand le limiteur dit success=true', async () => {
    limitMock.mockResolvedValueOnce({ success: true });
    expect(await isNewScan('member-1', '1.2.3.4')).toBe(true);
    expect(limitMock).toHaveBeenCalledWith('member-1:1.2.3.4');
  });

  it('renvoie false (doublon) quand le limiteur dit success=false', async () => {
    limitMock.mockResolvedValueOnce({ success: false });
    expect(await isNewScan('member-1', '1.2.3.4')).toBe(false);
  });

  it('fail-open (true) si Redis lève une exception', async () => {
    limitMock.mockRejectedValueOnce(new Error('redis down'));
    expect(await isNewScan('member-1', '1.2.3.4')).toBe(true);
  });
});
