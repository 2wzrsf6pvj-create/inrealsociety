// Contrat des réponses d'erreur de POST /api/message.
// Le composeur (/message) switche sur `data.code` (pas sur la copie FR). Ces
// tests verrouillent ce contrat : window_expired (+ windowHours), conversation_limit,
// paused, banned. Une régression du wording ne doit pas casser la détection client.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/ratelimit', () => ({
  checkMessageRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getIp:                 vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:      vi.fn(() => ({})),
}));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({
  sendEmail: vi.fn(), emailNouveauMessage: vi.fn(() => ({ subject: '', html: '' })),
  emailConversationLimit: vi.fn(() => ({ subject: '', html: '' })),
}));
vi.mock('@/lib/moderation', () => ({
  moderateContent: vi.fn().mockResolvedValue({ flagged: false, source: 'regex', categories: [] }),
}));
// Tâches confiées à waitUntil (envois après la réponse).
const handedOver = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('@/lib/wait-until', () => ({ waitUntil: (p: Promise<unknown>) => { handedOver.push(p); } }));

import { POST } from '@/app/api/message/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { moderateContent } from '@/lib/moderation';
import { sendEmail, emailNouveauMessage, emailConversationLimit } from '@/lib/email-templates';

const UUID = '11111111-1111-4111-8111-111111111111';

// Bornes `.gte()` reçues par le compte du plafond (fenêtre glissante).
const countWindow: { col: string; since: string }[] = [];
// Lignes insérées dans `messages` (cas qui vont jusqu'à l'insertion).
const inserted: Record<string, unknown>[] = [];

// Construit l'implémentation de supabaseAdmin.from selon le scénario.
function wireSupabase({ member, firstScanAt, activeConvs, bannedToken }: {
  member: { id: string; name: string; email: string | null; is_paused: boolean; require_contact?: boolean; plan: string } | null;
  firstScanAt?: string | null;
  activeConvs?: number;
  bannedToken?: string;
}) {
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'members') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: member, error: null }) }) }) };
    }
    if (table === 'first_scans') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: firstScanAt ? { first_scan_at: firstScanAt } : null, error: null,
      }) }) }) };
    }
    if (table === 'messages') {
      // .eq().eq().is('parent_id').is('blocked_at').gte('created_at') → count
      return {
        select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ is: () => ({ gte: (col: string, since: string) => {
          countWindow.push({ col, since });
          return Promise.resolve({ count: activeConvs ?? 0, error: null });
        } }) }) }) }) }),
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'msg-1' }, error: null }) }) };
        },
      };
    }
    if (table === 'blocks') {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () =>
        Promise.resolve({ data: null, error: null }) }) }) }) };
    }
    if (table === 'banned_devices') {
      return { select: () => ({ eq: (_col: string, token: string) => ({ maybeSingle: () =>
        Promise.resolve({ data: token === bannedToken ? { sender_token: token } : null, error: null }) }) }) };
    }
    return {};
  });
}

// req sans cookie irs_sender (scanneur jamais vu) → getSenderToken renvoie null.
function makeReq(body: Record<string, unknown>, senderToken?: string): NextRequest {
  return {
    json:    async () => body,
    cookies: { get: (name: string) => (name === 'irs_sender' && senderToken ? { value: senderToken } : undefined) },
  } as unknown as NextRequest;
}

describe('POST /api/message — contrat des codes d\'erreur', () => {
  beforeEach(() => { vi.clearAllMocks(); countWindow.length = 0; inserted.length = 0; });

  it('membre en pause → 403 code=paused', async () => {
    wireSupabase({ member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: true, plan: 'free' } });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('paused');
  });

  it('appareil banni → 403 code=banned, avec la raison et le recours (pas « indisponible »)', async () => {
    const token = '33333333-3333-4333-8333-333333333333';
    wireSupabase({ member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' }, bannedToken: token });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }, token));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('banned');
    expect(data.error).toContain('CGV, article 9');
    expect(data.error).toContain('hello@inrealsociety.com');
    expect(inserted).toHaveLength(0);
  });

  it('fenêtre expirée (free 24h) → 403 code=window_expired, windowHours=24', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: new Date(Date.now() - 25 * 3_600_000).toISOString(), // il y a 25h
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('window_expired');
    expect(data.windowHours).toBe(24);
  });

  it('fenêtre premium = 48h dans windowHours', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'premium' },
      firstScanAt: new Date(Date.now() - 49 * 3_600_000).toISOString(),
    });
    const data = await (await POST(makeReq({ memberId: UUID, content: 'salut' }))).json();
    expect(data.code).toBe('window_expired');
    expect(data.windowHours).toBe(48);
  });

  it('plafond de conversations atteint (free) → 403 code=conversation_limit', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: null,   // pas de scan → check fenêtre sauté
      activeConvs: 3,      // MAX free = 3
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('conversation_limit');
  });

  it('le plafond ne compte que les conversations des 7 derniers jours (fenêtre glissante)', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: null,
      activeConvs: 3,
    });
    await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(countWindow).toHaveLength(1);
    expect(countWindow[0].col).toBe('created_at');
    const ageDays = (Date.now() - Date.parse(countWindow[0].since)) / 86_400_000;
    expect(ageDays).toBeGreaterThan(6.99);
    expect(ageDays).toBeLessThan(7.01);
  });

  it('require_contact actif + aucun contact → 403 code=contact_required', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, require_contact: true, plan: 'free' },
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' })); // pas de senderContact
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('contact_required');
  });

  // Régression (choix B) : un message modéré N'EST PAS inséré → il ne consomme pas
  // le message unique du device, donc le scanneur peut reformuler après un faux
  // positif. Le mock `messages` n'expose pas `.insert` : si le code tentait
  // d'insérer, il ferait 500 → asserter 200 + moderated:true prouve la non-insertion.
  it('message modéré → 200 { moderated:true }, PAS d\'insertion (reformulation possible)', async () => {
    (moderateContent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ flagged: true, source: 'regex', categories: ['insult'] });
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: null, activeConvs: 0,
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'texte signalé' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.moderated).toBe(true);
    expect(data.messageId).toBeUndefined(); // rien inséré → pas d'id
  });

  // Le contact est affiché au porteur : il est modéré comme le message. Signalé →
  // tout le message est refusé (pas d'insertion), comme un contenu signalé.
  it('contact signalé → 200 { moderated:true }, PAS d\'insertion', async () => {
    (moderateContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ flagged: false, source: 'regex', categories: [] })              // message
      .mockResolvedValueOnce({ flagged: true,  source: 'regex', categories: ['harassment'] }); // contact
    wireSupabase({
      member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: false, plan: 'free' },
      firstScanAt: null, activeConvs: 0,
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut', senderContact: 'contact insultant' }));
    expect(res.status).toBe(200);
    expect((await res.json()).moderated).toBe(true);
    expect(moderateContent).toHaveBeenCalledWith('contact insultant');
    expect(inserted).toHaveLength(0);
  });

  it('prénom hors format (chiffres, phrase) → ignoré : message envoyé en anonyme', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: null, is_paused: false, plan: 'free' },
      firstScanAt: null, activeConvs: 0,
    });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut', senderName: 'Léa 06 12 34 56 78' }));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].sender_name).toBeNull();
    expect(moderateContent).not.toHaveBeenCalledWith('Léa 06 12 34 56 78');
  });

  it('prénom valide → conservé', async () => {
    wireSupabase({
      member: { id: UUID, name: 'A', email: null, is_paused: false, plan: 'free' },
      firstScanAt: null, activeConvs: 0,
    });
    await POST(makeReq({ memberId: UUID, content: 'salut', senderName: 'Jean-Baptiste' }));
    expect(inserted[0].sender_name).toBe('Jean-Baptiste');
  });
});

// Notifications du porteur après la réponse : le passant, souvent sur une 4G
// faible, n'attend pas Resend. waitUntil garde la fonction serverless en vie
// jusqu'au bout de l'envoi, sinon il se perdrait quand elle s'arrête.
describe('POST /api/message — notification du porteur', () => {
  beforeEach(() => { vi.clearAllMocks(); countWindow.length = 0; inserted.length = 0; handedOver.length = 0; });

  it('répond sans attendre l’email au porteur, confié à waitUntil, qui mène à la conversation', async () => {
    wireSupabase({
      member: { id: UUID, name: 'Camille', email: 'camille@example.com', is_paused: false, plan: 'free' },
      firstScanAt: null,
      activeConvs: 0,
    });
    let delivered = false;
    (sendEmail as ReturnType<typeof vi.fn>).mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => { delivered = true; resolve(true); }, 20)));

    const res = await POST(makeReq({ memberId: UUID, content: 'Belle audace.' }));
    expect(res.status).toBe(200);
    expect(delivered).toBe(false);
    expect(handedOver).toHaveLength(1);
    await handedOver[0];
    expect(delivered).toBe(true);
    expect(emailNouveauMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationUrl: expect.stringContaining('/conversation/msg-1') }));
  });
});

// Plafond gratuit atteint : le porteur est prévenu qu'il a manqué quelqu'un, une
// fois par semaine au plus (claim_cap_email, migration 059).
describe('POST /api/message — plafond atteint : email au porteur', () => {
  const capped = () => wireSupabase({
    member: { id: UUID, name: 'Camille', email: 'camille@example.com', is_paused: false, plan: 'free' },
    firstScanAt: null,
    activeConvs: 3,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    handedOver.length = 0;
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('premier refus de la semaine → refusé, et le porteur est prévenu (après la réponse)', async () => {
    capped();
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: true, error: null });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect((await res.json()).code).toBe('conversation_limit');
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('claim_cap_email', { p_member_id: UUID });
    expect(emailConversationLimit).toHaveBeenCalledWith(expect.objectContaining({
      maxConversations: 3, windowDays: 7, dashboardUrl: expect.stringContaining('/dashboard?tab=inbox'),
    }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'camille@example.com' }));
    expect(handedOver).toHaveLength(1);
  });

  it('déjà prévenu cette semaine → refusé, sans email', async () => {
    capped();
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: false, error: null });
    expect((await (await POST(makeReq({ memberId: UUID, content: 'salut' }))).json()).code).toBe('conversation_limit');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('migration 059 absente → refusé, sans email (sinon un email par refus)', async () => {
    capped();
    (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { message: 'missing' } });
    expect((await (await POST(makeReq({ memberId: UUID, content: 'salut' }))).json()).code).toBe('conversation_limit');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
