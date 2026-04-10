import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { messageId, starred, memberId } = await req.json();
  if (!messageId || !memberId) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });

  const { error } = await supabase.from('messages')
    .update({ starred: Boolean(starred) })
    .eq('id', messageId)
    .eq('member_id', memberId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}