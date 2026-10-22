// Signalements : un par (porteur, appareil) ; appareil banni dès que
// REPORT_BAN_THRESHOLD porteurs différents l'ont signalé.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

import { recordReport, senderTokenOf } from '@/lib/reports';
import { emailReportAlert } from '@/lib/email-templates';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { REPORT_BAN_THRESHOLD } from '@/lib/constants';

const TOKEN = '22222222-2222-4222-8222-222222222222';
const calls = { insert: [] as unknown[], upsert: [] as unknown[] };

function wire({ insertError = null, reporters = 1, rootToken = null }: {
  insertError?: { code: string } | null; reporters?: number; rootToken?: string | null;
}) {
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'message_reports') {
      return {
        insert: (row: unknown) => { calls.insert.push(row); return Promise.resolve({ error: insertError }); },
        select: () => ({ eq: () => Promise.resolve({ count: reporters, error: null }) }),
      };
    }
    if (table === 'banned_devices') {
      return { upsert: (row: unknown) => { calls.upsert.push(row); return Promise.resolve({ error: null }); } };
    }
    if (table === 'messages') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sender_token: rootToken } }) }) }) };
    }
    return {};
  });
}

describe('recordReport', () => {
  beforeEach(() => { vi.clearAllMocks(); calls.insert.length = 0; calls.upsert.length = 0; });

  it('sous le seuil : enregistré, pas de bannissement', async () => {
    wire({ reporters: REPORT_BAN_THRESHOLD - 1 });
    const out = await recordReport({ messageId: 'm', memberId: 'p', senderToken: TOKEN });
    expect(out).toEqual({ reporters: REPORT_BAN_THRESHOLD - 1, banned: false });
    expect(calls.insert).toEqual([{ message_id: 'm', member_id: 'p', sender_token: TOKEN }]);
    expect(calls.upsert).toHaveLength(0);
  });

  it('seuil atteint : appareil banni', async () => {
    wire({ reporters: REPORT_BAN_THRESHOLD });
    const out = await recordReport({ messageId: 'm', memberId: 'p', senderToken: TOKEN });
    expect(out.banned).toBe(true);
    expect(calls.upsert).toEqual([{ sender_token: TOKEN, reason: `auto : signalé par ${REPORT_BAN_THRESHOLD} porteurs` }]);
  });

  it('même porteur, même appareil (23505) : pas d’erreur, compté une fois', async () => {
    wire({ insertError: { code: '23505' }, reporters: 1 });
    await expect(recordReport({ messageId: 'm2', memberId: 'p', senderToken: TOKEN })).resolves.toEqual({ reporters: 1, banned: false });
  });

  it('autre erreur d’écriture : remontée (la route la journalise)', async () => {
    wire({ insertError: { code: '42P01' } });   // table absente (056 non appliquée)
    await expect(recordReport({ messageId: 'm', memberId: 'p', senderToken: TOKEN })).rejects.toBeTruthy();
  });

  it('appareil inconnu : enregistré, jamais compté ni banni', async () => {
    wire({ reporters: 99 });
    const out = await recordReport({ messageId: 'm', memberId: 'p', senderToken: null });
    expect(out).toEqual({ reporters: 0, banned: false });
    expect(calls.upsert).toHaveLength(0);
  });
});

describe('senderTokenOf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('message racine du passant : son jeton', async () => {
    wire({});
    expect(await senderTokenOf({ author: 'scanner', sender_token: TOKEN, parent_id: null })).toBe(TOKEN);
  });

  it('réponse du passant : jeton du message racine', async () => {
    wire({ rootToken: TOKEN });
    expect(await senderTokenOf({ author: 'scanner', sender_token: null, parent_id: 'racine' })).toBe(TOKEN);
  });

  it('message du porteur : attribué à personne', async () => {
    wire({ rootToken: TOKEN });
    expect(await senderTokenOf({ author: 'member', sender_token: null, parent_id: 'racine' })).toBeNull();
  });
});

describe('emailReportAlert', () => {
  const base = { memberName: 'Camille', memberId: 'p-1', content: 'texte', senderToken: TOKEN, threshold: 3 };

  it('échappe le contenu signalé', () => {
    const { html } = emailReportAlert({ ...base, content: '<script>alert(1)</script>', outcome: { reporters: 1, banned: false } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('bannissement : sujet explicite et SQL pour lever le ban', () => {
    const { subject, html } = emailReportAlert({ ...base, outcome: { reporters: 3, banned: true } });
    expect(subject).toContain('banni');
    expect(html).toContain(`DELETE FROM banned_devices WHERE sender_token = '${TOKEN}'`);
  });

  it('appareil inconnu : pas de SQL de bannissement', () => {
    const { html } = emailReportAlert({ ...base, senderToken: null, outcome: { reporters: 0, banned: false } });
    expect(html).not.toContain('banned_devices');
  });

  it('enregistrement échoué : le dit', () => {
    const { html } = emailReportAlert({ ...base, outcome: null });
    expect(html).toContain('non enregistré');
  });
});
