// Contrat des réponses d'erreur de POST /api/message.
// Le composeur (/message) switche sur `data.code` (pas sur la copie FR). Ces
// tests verrouillent ce contrat : window_expired (+ windowHours), conversation_limit,
// paused. Une régression du wording ne doit pas casser la détection client.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/ratelimit', () => ({
  checkMessageRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getIp:                 vi.fn(() => '1.2.3.4'),
  rateLimitHeaders:      vi.fn(() => ({})),
}));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({
  sendEmail: vi.fn(), emailNouveauMessage: vi.fn(() => ({ subject: '', html: '' })),
}));
vi.mock('@/lib/moderation', () => ({
  moderateContent: vi.fn().mockResolvedValue({ flagged: false, source: 'regex', categories: [] }),
}));

import { POST } from '@/app/api/message/route';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { moderateContent } from '@/lib/moderation';
import { sendEmail, emailNouveauMessage } from '@/lib/email-templates';

const UUID = '11111111-1111-4111-8111-111111111111';

// Bornes `.gte()` reçues par le compte du plafond (fenêtre glissante).
const countWindow: { col: string; since: string }[] = [];
// Lignes insérées dans `messages` (cas qui vont jusqu'à l'insertion).
const inserted: Record<string, unknown>[] = [];

// Construit l'implémentation de supabaseAdmin.from selon le scénario.
function wireSupabase({ member, firstScanAt, activeConvs }: {
  member: { id: string; name: string; email: string | null; is_paused: boolean; require_contact?: boolean; plan: string } | null;
  firstScanAt?: string | null;
  activeConvs?: number;
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
    return {};
  });
}

// req sans cookie irs_sender (scanneur jamais vu) → getSenderToken renvoie null.
function makeReq(body: Record<string, unknown>): NextRequest {
  return { json: async () => body, cookies: { get: () => undefined } } as unknown as NextRequest;
}

describe('POST /api/message — contrat des codes d\'erreur', () => {
  beforeEach(() => { vi.clearAllMocks(); countWindow.length = 0; inserted.length = 0; });

  it('membre en pause → 403 code=paused', async () => {
    wireSupabase({ member: { id: UUID, name: 'A', email: 'a@b.c', is_paused: true, plan: 'free' } });
    const res = await POST(makeReq({ memberId: UUID, content: 'salut' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('paused');
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

// Notifications du porteur attendues avant la réponse : en serverless, un envoi
// en tâche de fond peut se perdre quand la fonction s'arrête.
describe('POST /api/message — notification du porteur', () => {
  beforeEach(() => { vi.clearAllMocks(); countWindow.length = 0; inserted.length = 0; });

  it('l’email au porteur est parti avant la réponse, et mène à la conversation', async () => {
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
    expect(delivered).toBe(true);
    expect(emailNouveauMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationUrl: expect.stringContaining('/conversation/msg-1') }));
  });
});
