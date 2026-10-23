// Newsletter : lots de 100 emails, une requête Resend par lot (limite de débit :
// 10 requêtes par seconde pour tout le compte). Avant, des envois un par un, 10
// à la fois sans pause : au-delà de 10 par seconde, les refusés ne recevaient
// jamais la newsletter et la campagne était marquée envoyée.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const subscribed = Array.from({ length: 230 }, (_, i) => `s${i}@x.fr`);
const LISTS: Record<string, string[]> = {
  'newsletter_subscribers|unsubscribed_at is null':     subscribed,
  'newsletter_subscribers|unsubscribed_at not is null': ['old@x.fr'],
  'members|marketing_consent=true':                     ['m1@x.fr', 's1@x.fr'],
  'members|marketing_consent=false':                    ['s2@x.fr'],
};
const campaignUpdates: unknown[] = [];

vi.mock('@/lib/supabase-admin', () => {
  function builder(table: string) {
    const filters: string[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let values: unknown;
    const b = {
      select: () => b,
      is:     (col: string, v: unknown) => { filters.push(`${col} is ${v}`); return b; },
      not:    (col: string, o: string, v: unknown) => { if (col !== 'email') filters.push(`${col} not ${o} ${v}`); return b; },
      eq:     (col: string, v: unknown): unknown => {
        if (op === 'update') { campaignUpdates.push(values); return Promise.resolve({ error: null }); }
        if (col !== 'key') filters.push(`${col}=${v}`);
        return b;
      },
      insert: (v: unknown) => { op = 'insert'; values = v; return b; },
      update: (v: unknown) => { op = 'update'; values = v; return b; },
      range:  (from: number, to: number) => {
        const rows = (LISTS[`${table}|${filters.join('&')}`] ?? []).slice(from, to + 1);
        return Promise.resolve({ data: rows.map((email) => ({ email })), error: null });
      },
      maybeSingle: () => Promise.resolve(op === 'insert' ? { data: { id: 'c1' }, error: null } : { data: null, error: null }),
    };
    return b;
  }
  return { supabaseAdmin: { from: builder } };
});

import { POST } from '@/app/api/newsletter/send/route';

type Sent = { to: string[]; headers: Record<string, string> };
const batches: Sent[][] = [];

beforeEach(() => {
  batches.length = 0;
  campaignUpdates.length = 0;
  vi.stubEnv('INTERNAL_SECRET', 'secret-de-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('https://api.resend.com/emails/batch');
    const emails = JSON.parse(String(init.body)) as Sent[];
    batches.push(emails);
    // Le 2e lot : une adresse refusée par Resend.
    const errors = batches.length === 2 ? [{ index: 0, message: 'invalid to' }] : [];
    return new Response(JSON.stringify({ data: emails.map((_, i) => ({ id: String(i) })), errors }), { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = () => POST(new NextRequest('http://localhost/api/newsletter/send', {
  method:  'POST',
  headers: { 'x-internal-secret': 'secret-de-test' },
  body:    JSON.stringify({ key: 'octobre', subject: 'Nouvelles', html: '<p>Bonjour</p>' }),
}));

describe('POST /api/newsletter/send — par lots', () => {
  it('230 destinataires : 3 requêtes (100, 100, 30), refusés comptés', async () => {
    const res = await send();
    expect(await res.json()).toMatchObject({ ok: true, sent: 229, failures: 1, audience: 230 });
    expect(batches.map((b) => b.length)).toEqual([100, 100, 30]);
    expect(campaignUpdates).toEqual([{ recipients: 229, failures: 1 }]);
  });

  it('chaque email porte SON lien de désinscription en un clic', async () => {
    await send();
    for (const email of batches.flat()) {
      const to = email.to[0];
      expect(email.headers['List-Unsubscribe']).toContain(`e=${encodeURIComponent(to)}&t=`);
      expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }
  });

  it('désinscrits retirés, consentements des membres ajoutés, sans doublon', async () => {
    await send();
    const all = batches.flat().map((e) => e.to[0]);
    expect(all).toContain('m1@x.fr');
    expect(all).not.toContain('s2@x.fr');
    expect(all).not.toContain('old@x.fr');
    expect(new Set(all).size).toBe(all.length);
  });
});
