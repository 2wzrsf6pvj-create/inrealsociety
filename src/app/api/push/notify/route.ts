// src/app/api/push/notify/route.ts
// POST { messageId, title, body, url }
// Route interne protégée par INTERNAL_SECRET. La logique est extraite dans
// lib/push-notify.ts pour pouvoir aussi être appelée en interne directement
// (depuis /api/conversation/reply, etc.) sans HTTP roundtrip.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { notifyThreadSubscribers } from '@/lib/push-notify';

const schema = z.object({
  messageId: z.string().uuid(),
  title:     z.string().min(1).max(200),
  body:      z.string().max(1000).optional(),
  url:       z.string().url().max(2048).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret');
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const result = await notifyThreadSubscribers(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[push/notify]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
