// src/app/api/mark-read/route.ts
// POST /api/mark-read { messageId, memberId }

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { getIp } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const { messageId, memberId } = await req.json();

    if (!messageId || !memberId) {
      return NextResponse.json({ error: 'messageId et memberId requis' }, { status: 400 });
    }

    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('member_id', memberId)
      .is('read_at', null);

    if (error) throw error;

    audit({
      action:   'message.read',
      memberId,
      ip:       getIp(req),
      metadata: { messageId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/mark-read]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}