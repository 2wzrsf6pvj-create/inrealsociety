// app/api/referral/route.ts
// POST { referrerId, orderId } — enregistre un parrainage
// GET  ?memberId=xxx           — nombre de parrainages

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { getIp } from '@/lib/ratelimit';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redis: Redis;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

const limitReferralByIp = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(10, '10 m'),
  prefix:  'rl:referral:ip',
});

const postSchema = z.object({
  referrerId: z.string().uuid(),
  orderId:    z.string().uuid().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    // ─── Rate limiting ────────────────────────────────────────────────────
    const ip = getIp(req);
    const rl = await limitReferralByIp().limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Trop de requêtes.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } },
      );
    }

    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const body = postSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }
    const { referrerId, orderId } = body.data;

    const own = await requireOwnership(auth.user.id, referrerId);
    if (isHttpError(own)) return own;

    // ─── Si orderId fourni, vérifie qu'il existe bien ────────────────────
    if (orderId) {
      const { data: order } = await supabaseAdmin
        .from('orders').select('id').eq('id', orderId).single();

      if (!order) {
        return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
      }
    }

    // ─── Insertion parrainage ─────────────────────────────────────────────
    const { error } = await supabaseAdmin
      .from('referrals')
      .insert({ referrer_id: referrerId, order_id: orderId || null });

    if (error && error.code !== '23505') throw error;

    if (orderId && !error) {
      await supabaseAdmin.from('orders')
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
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const memberId = req.nextUrl.searchParams.get('memberId');
    if (!memberId) return NextResponse.json({ count: 0 });

    if (!UUID_RE.test(memberId)) {
      return NextResponse.json({ error: 'memberId invalide' }, { status: 400 });
    }

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const { count, error } = await supabaseAdmin
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
