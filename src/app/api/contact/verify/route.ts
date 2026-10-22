// GET /api/contact/verify?token=… — lien de confirmation reçu par le passant qui
// a laissé son email avec un message. Confirme l'adresse (double opt-in) puis
// redirige vers /contact/confirme. Si le porteur avait déjà répondu, sa dernière
// réponse part tout de suite : le passant ne la rate pas pour avoir confirmé tard.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp } from '@/lib/ratelimit';
import { confirmContactToken } from '@/lib/contact-verification';
import { sendEmail, emailReponse } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';

// Jeton : 32 octets aléatoires en base64url (cf. startContactVerification).
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

function arrival(statut: 'ok' | 'expire' | 'invalide' | 'reessayer', conversation?: string) {
  const url = new URL('/contact/confirme', APP_URL);
  url.searchParams.set('statut', statut);
  if (conversation) url.searchParams.set('conversation', conversation);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  try {
    const rl = await checkPublicRateLimit(getIp(req));
    if (!rl.success) return arrival('reessayer');

    const parsed = tokenSchema.safeParse(req.nextUrl.searchParams.get('token'));
    if (!parsed.success) return arrival('invalide');

    const result = await confirmContactToken(parsed.data);
    if (result.status !== 'ok') return arrival(result.status === 'expired' ? 'expire' : 'invalide');

    if (result.firstConfirmation) {
      const { data: lastReply } = await supabaseAdmin
        .from('messages')
        .select('content')
        .eq('parent_id', result.messageId)
        .eq('author', 'member')
        .eq('moderated', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastReply) {
        const { data: root } = await supabaseAdmin
          .from('messages').select('members(name)').eq('id', result.messageId).maybeSingle();
        const memberName = (root?.members as unknown as { name: string } | null)?.name ?? 'Ce membre';
        const { subject, html } = emailReponse({
          memberName,
          reply:   lastReply.content,
          convUrl: `${APP_URL}/conversation/${result.messageId}`,
        });
        const sent = await sendEmail({ to: result.email, subject, html });
        if (!sent) console.error('[api/contact/verify] réponse en attente non envoyée');
      }
    }

    return arrival('ok', result.messageId);
  } catch (err) {
    console.error('[api/contact/verify]', err);
    return arrival('reessayer');
  }
}
