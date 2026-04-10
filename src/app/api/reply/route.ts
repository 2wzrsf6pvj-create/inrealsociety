// src/app/api/reply/route.ts
// POST /api/reply { messageId, reply, memberId }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireOwnership, isHttpError } from '@/lib/require-auth';
import { sendEmail, emailReponse } from '@/lib/email-templates';
import { audit } from '@/lib/audit';
import { getIp, checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  messageId: z.string().uuid(),
  memberId:  z.string().uuid(),
  reply:     z.string().min(1).max(2000),
});

function isValidEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function isInstagramHandle(str: string): boolean {
  return /^@[a-zA-Z0-9._]{1,30}$/.test(str);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    const { messageId, reply, memberId } = body.data;
    const ip = getIp(req);

    const own = await requireOwnership(auth.user.id, memberId);
    if (isHttpError(own)) return own;

    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('id, member_id, sender_contact')
      .eq('id', messageId)
      .eq('member_id', memberId)
      .single();

    if (!msg) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('messages')
      .update({ reply: reply.trim(), replied_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) throw error;

    audit({
      action:   'reply.sent',
      memberId,
      ip,
      metadata: { messageId },
    });

    const contact = msg.sender_contact?.trim();
    let emailSent = false;

    if (contact && isValidEmail(contact)) {
      const { data: memberData } = await supabaseAdmin
        .from('members').select('name').eq('id', memberId).single();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';
      const { subject, html } = emailReponse({
        memberName: memberData?.name || 'Ce membre',
        reply:      reply.trim(),
        convUrl:    `${appUrl}/conversation/${messageId}`,
      });

      await sendEmail({ to: contact, subject, html });
      emailSent = true;
    }

    return NextResponse.json({
      ok:          true,
      emailSent,
      isInstagram: contact ? isInstagramHandle(contact) : false,
      contact:     contact || null,
    });

  } catch (err) {
    console.error('[api/reply]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
