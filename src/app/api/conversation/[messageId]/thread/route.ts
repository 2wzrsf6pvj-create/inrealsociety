// GET /api/conversation/[messageId]/thread
// Rattrapage : renvoie les réponses (non modérées) d'une conversation, pour que le
// client resynchronise après une coupure realtime (onglet en arrière-plan, reconnexion).
// Le scanneur anon ne peut pas lire `messages` sous RLS → endpoint nécessaire.
//
// Capability = le messageId (UUID non devinable), comme la page /conversation/[id]
// et le canal realtime. Public, rate-limité. NE renvoie JAMAIS de contenu modéré,
// ni sender_token / sender_contact (uniquement id/content/author/created_at).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';

export async function GET(req: NextRequest, { params }: { params: { messageId: string } }) {
  const parsed = z.string().uuid().safeParse(params.messageId);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ID invalide.' }, { status: 400 });
  }
  const messageId = parsed.data;

  const rl = await checkPublicRateLimit(getIp(req));
  if (!rl.success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Vérifie que la racine existe (conversation valide).
  const { data: root } = await supabaseAdmin
    .from('messages').select('id').eq('id', messageId).is('parent_id', null).maybeSingle();
  if (!root) {
    return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
  }

  // Réponses non modérées uniquement, champs minimaux.
  const { data: replies } = await supabaseAdmin
    .from('messages')
    .select('id, content, author, created_at')
    .eq('parent_id', messageId)
    .eq('moderated', false)
    .order('created_at', { ascending: true });

  return NextResponse.json({ thread: replies ?? [] });
}
