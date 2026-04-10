// src/app/api/star/route.ts
// POST { messageId, starred, memberId }

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { getIp } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const { messageId, starred, memberId } = await req.json();

    if (!messageId || !memberId) {
      return NextResponse.json({ error: 'messageId et memberId requis' }, { status: 400 });
    }

    if (typeof starred !== 'boolean') {
      return NextResponse.json({ error: 'starred doit être un booléen' }, { status: 400 });
    }

    const { error, count } = await supabase
      .from('messages')
      .update({ starred })
      .eq('id', messageId)
      .eq('member_id', memberId);

    if (error) throw error;
    if (count === 0) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    }

    audit({
      action:   'message.starred',
      memberId,
      ip:       getIp(req),
      metadata: { messageId, starred },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/star]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}