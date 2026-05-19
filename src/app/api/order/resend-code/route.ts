// POST /api/order/resend-code { email }
// Renvoie le code d'activation de la commande la plus récente pour cet email,
// uniquement si ce code n'a pas encore été consommé.
//
// Anti-énumération : la réponse est toujours { ok: true } quelle que soit
// l'existence d'une commande, pour éviter qu'un attaquant ne puisse vérifier
// quels emails ont commandé. Le seul code d'erreur retourné est 429 (rate limit).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailActivation } from '@/lib/email-templates';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { APP_URL } from '@/lib/constants';

const schema = z.object({
  email: z.string().email().max(320),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getIp(req);
    const rl = await checkPublicRateLimit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: 'Trop de requêtes.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ ok: true });

    const { email } = body.data;

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, activation_code')
      .eq('email', email)
      .eq('status', 'paid')
      .not('activation_code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order?.activation_code) {
      return NextResponse.json({ ok: true });
    }

    const { data: codeRow } = await supabaseAdmin
      .from('activation_codes')
      .select('code, used')
      .eq('code', order.activation_code)
      .maybeSingle();

    if (!codeRow || codeRow.used) {
      return NextResponse.json({ ok: true });
    }

    const { subject, html } = emailActivation({
      code:        order.activation_code,
      registerUrl: `${APP_URL}/register?code=${order.activation_code}`,
    });

    try {
      await sendEmail({ to: email, subject, html });
      audit({
        action:   'order.email_resent',
        metadata: { orderId: order.id, email, ip },
      });
    } catch (err) {
      audit({
        action:   'order.email_failed',
        metadata: { orderId: order.id, email, kind: 'resend', error: err instanceof Error ? err.message : String(err) },
      });
      console.error('[api/order/resend-code] sendEmail failed:', err);
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[api/order/resend-code]', err);
    return NextResponse.json({ ok: true });
  }
}
