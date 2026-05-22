// GET /api/messages?memberId=xxx&offset=10&limit=10
// Pagination des messages pour l'inbox du dashboard.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { getMessages } from '@/lib/inbox';

// Pas de rate-limit ici volontairement : route en LECTURE seule, gated par
// requireAuth + requireOwnership (un membre ne lit que sa propre inbox). Le
// limiteur auth (5/10min) casserait la pagination « charger plus ». Le coût
// d'abus est nul (données propres au membre).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const memberId = req.nextUrl.searchParams.get('memberId');
    const offset   = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);
    const limit    = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '10', 10), 50);

    if (!memberId) {
      return NextResponse.json({ error: 'memberId requis.' }, { status: 400 });
    }

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const messages = await getMessages(memberId, limit, offset);

    return NextResponse.json({ messages });

  } catch (err) {
    console.error('[api/messages]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
