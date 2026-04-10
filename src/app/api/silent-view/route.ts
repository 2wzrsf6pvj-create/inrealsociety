// app/api/silent-view/route.ts
// Vue silencieuse (sans email) — incrémente uniquement le compteur de scans.

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { memberId, scannerName } = await req.json();

    if (!memberId || typeof memberId !== 'string') {
      return NextResponse.json({ error: 'memberId requis' }, { status: 400 });
    }

    if (scannerName && (typeof scannerName !== 'string' || scannerName.length > 100)) {
      return NextResponse.json({ error: 'scannerName invalide' }, { status: 400 });
    }

    // Vérifie que le membre existe
    const { data: member } = await supabase
      .from('members').select('id, is_paused').eq('id', memberId).single();

    if (!member) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    if (member.is_paused) return NextResponse.json({ ok: true, paused: true });

    await supabase.from('silent_views').insert({
      member_id:    memberId,
      scanner_name: scannerName || null,
    });

    await supabase.rpc('increment_scan_count', { member_id: memberId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[silent-view]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}