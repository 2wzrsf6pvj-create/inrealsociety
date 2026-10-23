// Administration de la modération (/admin, choix de Clément) : accès réservé à
// ADMIN_EMAILS avec adresse confirmée (404 sinon), décisions tracées dans
// audit_logs, signalement clos, personne visée et auteur du signalement
// prévenus quand c'est possible (DSA, art. 16 et 17).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Faux Supabase : enregistre chaque écriture ─────────────────────────────
type Op = { table: string; op: string; values?: unknown; filters: Record<string, unknown> };
const ops: Op[] = [];
const removed: string[][] = [];
let memberRow: Record<string, unknown> | null = null;
let reportMeta: Record<string, unknown> | null = null;
let hiddenMessage: { member_id: string } | null = null;

function builder(table: string, op: string, values?: unknown) {
  const entry: Op = { table, op, values, filters: {} };
  if (op !== 'select') ops.push(entry);
  const result = () => {
    if (op === 'select' && table === 'members') return { data: memberRow, error: null };
    if (op === 'select' && table === 'audit_logs') return { data: reportMeta ? { metadata: reportMeta } : null, error: null };
    if (op === 'update' && table === 'messages') return { data: hiddenMessage, error: null };
    return { data: null, error: null };
  };
  const chain: Record<string, unknown> = {
    eq:          (col: string, v: unknown) => { entry.filters[col] = v; return chain; },
    select:      () => chain,
    maybeSingle: async () => result(),
    then:        (resolve: (v: unknown) => void) => resolve(result()),
  };
  return chain;
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      update: (v: unknown) => builder(table, 'update', v),
      insert: (v: unknown) => builder(table, 'insert', v),
      upsert: (v: unknown) => builder(table, 'upsert', v),
      delete: () => builder(table, 'delete'),
    }),
    storage: { from: () => ({ remove: async (paths: string[]) => { removed.push(paths); return { error: null }; } }) },
  },
}));
let currentUser: Record<string, unknown> | null = null;
vi.mock('@/lib/require-auth', () => ({
  requireAuth: async () => currentUser
    ? { user: currentUser }
    : NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }),
  isHttpError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/ratelimit', () => ({
  checkAuthRateLimit: vi.fn().mockResolvedValue({ success: true }),
  rateLimitHeaders:   vi.fn(() => ({})),
}));
vi.mock('@/lib/email-templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-templates')>()),
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from '@/app/api/admin/moderation/route';
import { isAdmin } from '@/lib/admin';
import { pending, latestPerMember } from '@/lib/moderation-queue';
import { sendEmail } from '@/lib/email-templates';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const TOKEN  = '22222222-2222-4222-8222-222222222222';
const MSG    = '33333333-3333-4333-8333-333333333333';
const REPORT = `profile:${'44444444-4444-4444-8444-444444444444'}`;
const ADMIN  = { id: 'auth-admin', email: 'Clement@Example.com', email_confirmed_at: '2026-10-01T00:00:00Z' };

const post = (body: unknown, origin = 'http://localhost:3000') =>
  POST(new NextRequest('http://localhost:3000/api/admin/moderation', {
    method: 'POST', body: JSON.stringify(body), headers: { origin, 'content-type': 'application/json' },
  }));
const audits = () => ops.filter((o) => o.table === 'audit_logs' && o.op === 'insert').map((o) => o.values as Record<string, unknown>);
const mails  = () => (sendEmail as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as { to: string; subject: string; html: string });

beforeEach(() => {
  vi.clearAllMocks();
  ops.length = 0;
  removed.length = 0;
  vi.stubEnv('ADMIN_EMAILS', 'clement@example.com, autre@example.com');
  currentUser = ADMIN;
  memberRow = { id: MEMBER, name: 'Camille', email: 'camille@example.com' };
  reportMeta = { reason: 'Photo choquante.', contact: 'lea@example.com' };
  hiddenMessage = { member_id: MEMBER };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('isAdmin', () => {
  it('email listé (casse ignorée) et confirmé', () => {
    expect(isAdmin(ADMIN)).toBe(true);
  });
  it('adresse non confirmée, email absent de la liste, liste vide : refusé', () => {
    expect(isAdmin({ ...ADMIN, email_confirmed_at: undefined })).toBe(false);
    expect(isAdmin({ ...ADMIN, email: 'intrus@example.com' })).toBe(false);
    vi.stubEnv('ADMIN_EMAILS', '');
    expect(isAdmin(ADMIN)).toBe(false);
  });
});

describe('file de modération', () => {
  it('pending : écarte les éléments déjà traités', () => {
    expect(pending([{ key: 'a' }, { key: 'b' }], new Set(['a']))).toEqual([{ key: 'b' }]);
  });
  it('latestPerMember : une photo par porteur, la plus récente', () => {
    const rows = [{ id: '3', member_id: 'm1' }, { id: '2', member_id: 'm2' }, { id: '1', member_id: 'm1' }];
    expect(latestPerMember(rows).map((r) => r.id)).toEqual(['3', '2']);
  });
});

describe('POST /api/admin/moderation — accès', () => {
  it('non connecté → 401 ; connecté sans être admin → 404, rien n’est fait', async () => {
    currentUser = null;
    expect((await post({ action: 'unban_device', senderToken: TOKEN })).status).toBe(401);
    currentUser = { id: 'x', email: 'porteur@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' };
    expect((await post({ action: 'unban_device', senderToken: TOKEN })).status).toBe(404);
    expect(ops).toHaveLength(0);
  });

  it('requête venue d’un autre site → 403', async () => {
    expect((await post({ action: 'unban_device', senderToken: TOKEN }, 'https://malveillant.example')).status).toBe(403);
    expect(ops).toHaveLength(0);
  });

  it('motif trop court → 400', async () => {
    expect((await post({ action: 'suspend_member', memberId: MEMBER, motif: 'x' })).status).toBe(400);
  });
});

describe('POST /api/admin/moderation — décisions', () => {
  it('suspendre depuis un signalement : profil suspendu, tracé, clos, porteur et auteur prévenus', async () => {
    const res = await post({ action: 'suspend_member', memberId: MEMBER, motif: 'Présentation <insultante>', reportKey: REPORT, notifyReporter: true });
    expect(await res.json()).toEqual({ ok: true, memberNotified: true, reporterNotified: true });

    const update = ops.find((o) => o.table === 'members' && o.op === 'update')!;
    expect(update.values).toEqual(expect.objectContaining({ is_paused: true, suspended_at: expect.any(String) }));
    expect(update.filters).toEqual({ id: MEMBER });
    expect(audits()).toEqual([
      expect.objectContaining({ action: 'member.suspended', member_id: MEMBER,
        metadata: { by: 'clement@example.com', motif: 'Présentation <insultante>', source: 'moderation' } }),
      expect.objectContaining({ action: 'moderation.report_handled',
        metadata: expect.objectContaining({ reportKey: REPORT, decision: 'le profil signalé a été suspendu.' }) }),
    ]);

    const [toMember, toReporter] = mails();
    expect(toMember.to).toBe('camille@example.com');
    expect(toMember.subject).toBe('Votre profil In Real Society est suspendu');
    expect(toMember.html).toContain('Présentation &lt;insultante&gt;');   // motif échappé
    expect(toMember.html).toContain('article 9');
    expect(toReporter.to).toBe('lea@example.com');
    expect(toReporter.subject).toBe('Suite de votre signalement');
  });

  it('auteur sans email (@instagram) : non prévenu', async () => {
    reportMeta = { reason: 'Photo choquante.', contact: '@lea' };
    const res = await post({ action: 'mark_handled', reportKey: REPORT, decision: 'rien de contraire aux règles', notifyReporter: true });
    expect(await res.json()).toEqual({ ok: true, memberNotified: null, reporterNotified: false });
    expect(mails()).toHaveLength(0);
    expect(audits()[0]).toEqual(expect.objectContaining({
      action: 'moderation.report_handled', metadata: expect.objectContaining({ decision: 'rien de contraire aux règles' }),
    }));
  });

  it('retirer une photo : photo effacée du profil et du stockage, porteur prévenu', async () => {
    const res = await post({ action: 'remove_photo', memberId: MEMBER, motif: 'Photo explicite' });
    expect((await res.json()).memberNotified).toBe(true);
    expect(ops.find((o) => o.table === 'members' && o.op === 'update')!.values).toEqual({ photo_url: null });
    expect(removed[0]).toEqual([`${MEMBER}/avatar.jpg`, `${MEMBER}/avatar.png`, `${MEMBER}/avatar.webp`]);
    expect(audits()[0]).toEqual(expect.objectContaining({ action: 'member.photo_removed' }));
    expect(mails()[0].subject).toBe('Votre photo de profil a été retirée');
  });

  it('bannir puis lever le bannissement d’un appareil : tracé, personne à prévenir', async () => {
    expect(await (await post({ action: 'ban_device', senderToken: TOKEN, motif: 'Harcèlement' })).json())
      .toEqual({ ok: true, memberNotified: null, reporterNotified: null });
    expect(ops.find((o) => o.op === 'upsert')!.values).toEqual({ sender_token: TOKEN, reason: 'équipe : Harcèlement' });
    expect((await post({ action: 'unban_device', senderToken: TOKEN })).status).toBe(200);
    expect(ops.find((o) => o.op === 'delete')!.filters).toEqual({ sender_token: TOKEN });
    expect(audits().map((a) => a.action)).toEqual(['device.banned', 'device.unbanned']);
  });

  it('lever une suspension : porteur prévenu que son profil est rétabli', async () => {
    expect((await post({ action: 'unsuspend_member', memberId: MEMBER })).status).toBe(200);
    expect(ops.find((o) => o.op === 'update')!.values).toEqual({ suspended_at: null, is_paused: false });
    expect(mails()[0].subject).toBe('Votre profil In Real Society est rétabli');
  });

  it('masquer un message : tracé ; message inconnu → 404', async () => {
    expect((await post({ action: 'hide_message', messageId: MSG, motif: 'Menace' })).status).toBe(200);
    expect(audits()[0]).toEqual(expect.objectContaining({ action: 'message.hidden', member_id: MEMBER }));
    hiddenMessage = null;
    expect((await post({ action: 'hide_message', messageId: MSG, motif: 'Menace' })).status).toBe(404);
  });

  it('porteur sans email ou envoi impossible : signalé comme non prévenu', async () => {
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    expect((await (await post({ action: 'remove_photo', memberId: MEMBER, motif: 'Photo explicite' })).json()).memberNotified).toBe(false);
    memberRow = { id: MEMBER, name: 'Camille', email: null };
    expect((await (await post({ action: 'remove_photo', memberId: MEMBER, motif: 'Photo explicite' })).json()).memberNotified).toBe(false);
  });

  it('profil inconnu → 404, rien n’est tracé', async () => {
    memberRow = null;
    expect((await post({ action: 'suspend_member', memberId: MEMBER, motif: 'Harcèlement' })).status).toBe(404);
    expect(audits()).toHaveLength(0);
  });
});
