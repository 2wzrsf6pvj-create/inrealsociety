// DELETE /api/member/delete
// Supprime le profil membre et le compte auth (RGPD).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import Stripe from 'stripe';

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    // Récupère le membre
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, stripe_customer_id, stripe_subscription_id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // Annule l'abonnement Stripe si actif
    if (member.stripe_subscription_id) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2026-03-25.dahlia',
        });
        await stripe.subscriptions.cancel(member.stripe_subscription_id);
      } catch (err) {
        console.warn('[member/delete] Échec annulation Stripe:', err);
      }
    }

    // Supprime les données liées (vérifie chaque étape)
    const deletes = [
      supabaseAdmin.from('messages').delete().eq('member_id', member.id),
      supabaseAdmin.from('scans').delete().eq('member_id', member.id),
      supabaseAdmin.from('silent_views').delete().eq('member_id', member.id),
      supabaseAdmin.from('push_subscriptions').delete().eq('member_id', member.id),
      supabaseAdmin.from('audit_logs').delete().eq('member_id', member.id),
      supabaseAdmin.from('referrals').delete().eq('referrer_id', member.id),
      supabaseAdmin.from('activation_codes').update({ member_id: null }).eq('member_id', member.id),
    ];

    const results = await Promise.all(deletes);
    const failed = results.filter(r => r.error);
    if (failed.length) {
      console.error('[member/delete] Échec suppression partielle:', failed.map(r => r.error?.message));
    }

    // Supprime le membre
    const { error: memberDeleteErr } = await supabaseAdmin.from('members').delete().eq('id', member.id);
    if (memberDeleteErr) throw memberDeleteErr;

    // Supprime le compte auth Supabase
    await supabaseAdmin.auth.admin.deleteUser(auth.user.id);

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[member/delete]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
