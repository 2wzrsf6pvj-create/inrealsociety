// src/app/api/order/status/route.ts
// GET /api/order/status?code=<code d'activation>
// Suivi de commande pour l'acheteur (invité, pas de compte requis). Le code
// d'activation — non-devinable, envoyé à l'acheteur par email + affiché sur
// /shop/success — sert de capability : qui le possède peut voir SA commande.
// Public (pas d'auth), rate-limité, anti brute-force. Enrichit avec le suivi
// Printful en direct si la commande est partie en production.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { getPrintfulTracking } from '@/lib/printful-status';

const schema = z.object({
  code: z.string().min(4).max(64).regex(/^[A-Za-z0-9-]+$/, 'Code invalide'),
});

export async function GET(req: NextRequest) {
  // Rate limit : le code est secret mais on throttle quand même tout brute-force.
  const rl = await checkPublicRateLimit(getIp(req));
  if (!rl.success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const parsed = schema.safeParse({ code: req.nextUrl.searchParams.get('code') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ found: false }, { status: 400 });
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('status, tshirt_color, tshirt_size, qr_style, amount, created_at, fulfilled_at, printful_order_id')
    .eq('activation_code', parsed.data.code)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  // Suivi en direct seulement si la commande est partie chez Printful.
  const tracking = (order.fulfilled_at && order.printful_order_id)
    ? await getPrintfulTracking(order.printful_order_id)
    : null;

  return NextResponse.json({
    found: true,
    order: {
      status:      order.status,        // pending | paid | refunded
      color:       order.tshirt_color,  // dark | light
      size:        order.tshirt_size,
      qrStyle:     order.qr_style,      // sharp | rounded | soft (pré-remplit register)
      amount:      order.amount,        // centimes
      createdAt:   order.created_at,
      fulfilledAt: order.fulfilled_at,  // envoyé en production
      // fulfilled = déjà imprimé → le style n'est plus modifiable (info pour l'UI)
      locked:      !!order.fulfilled_at,
    },
    tracking, // { printfulStatus, shipments[] } | null
  });
}
