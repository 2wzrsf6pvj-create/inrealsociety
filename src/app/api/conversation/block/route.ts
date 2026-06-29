// src/app/api/conversation/block/route.ts
// POST { messageId, memberId, action: 'block' | 'unblock' }
// Le porteur bloque/débloque le scanneur d'une conversation. Protégé : auth +
// ownership. Le blocage ferme la conversation ET coupe le re-contact du device
// (via sender_token). Voir src/lib/blocks.ts.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders, getIp } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { blockConversation, unblockConversation } from '@/lib/blocks';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
  action:    z.enum(['block', 'unblock']),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { messageId, memberId, action } = body.data;

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    // Conversation racine du porteur (+ jeton device à bloquer/débloquer).
    const { data: rootMsg } = await supabaseAdmin
      .from('messages')
      .select('id, sender_token')
      .eq('id', messageId)
      .eq('member_id', memberId)
      .is('parent_id', null)
      .single();

    if (!rootMsg) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }

    const params = { memberId, messageId, senderToken: rootMsg.sender_token ?? null };
    if (action === 'block') {
      await blockConversation(params);
    } else {
      await unblockConversation(params);
    }

    audit({
      action:   action === 'block' ? 'conversation.blocked' : 'conversation.unblocked',
      memberId,
      ip:       getIp(req),
      // sender_token (pseudonyme) logué pour relier un device à travers plusieurs
      // porteurs (harcèlement en série) → décider d'un ban global. Trace 24 mois.
      metadata: { messageId, senderToken: rootMsg.sender_token ?? null },
    });

    return NextResponse.json({ ok: true, blocked: action === 'block' });
  } catch (err) {
    console.error('[api/conversation/block]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
