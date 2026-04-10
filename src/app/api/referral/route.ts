// app/api/referral/route.ts
// POST { referrerId, orderId } — enregistre un parrainage
// GET  ?memberId=xxx           — nombre de parrainages

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { referrerId, orderId } = await req.json();

    if (!referrerId || typeof referrerId !== 'string') {
      return NextResponse.json({ error: 'referrerId requis' }, { status: 400 });
    }

    // ─── Vérification que le membre parrain existe ────────────────────────
    const { data: member } = await supabase
      .from('members').select('id').eq('id', referrerId).single();

    if (!member) {
      return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    }

    // ─── Si orderId fourni, vérifie qu'il existe bien ────────────────────
    if (orderId) {
      const { data: order } = await supabase
        .from('orders').select('id').eq('id', orderId).single();

      if (!order) {
        return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
      }
    }

    // ─── Insertion parrainage ─────────────────────────────────────────────
    const { error } = await supabase
      .from('referrals')
      .insert({ referrer_id: referrerId, order_id: orderId || null });

    // Ignore les doublons (même parrain / même commande)
    if (error && error.code !== '23505') throw error;

    if (orderId && !error) {
      await supabase.from('orders')
        .update({ referrer_id: referrerId })
        .eq('id', orderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[referral POST]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const memberId = req.nextUrl.searchParams.get('memberId');
    if (!memberId) return NextResponse.json({ count: 0 });

    const { count, error } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', memberId);

    if (error) throw error;

    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    console.error('[referral GET]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}