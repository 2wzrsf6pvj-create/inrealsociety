// src/app/api/member/update/route.ts
// PATCH { name, pitch, instagram } — met à jour le profil du membre authentifié.
// Remplace l'appel direct à updateMember() depuis le client.
// Protégé : session + vérification ownership serveur.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';

const schema = z.object({
  name:      z.string().min(1).max(50).trim().optional(),
  pitch:     z.string().min(1).max(500).trim().optional(),
  instagram: z.string().max(50).optional(),
  is_paused: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    // ─── Vérification session ─────────────────────────────────────────────
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return req.cookies.get(name)?.value; },
          set() {}, remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    // ─── Validation ───────────────────────────────────────────────────────
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    // ─── Vérifie ownership : récupère le membre lié à ce user ────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    // ─── Mise à jour — uniquement sur le membre de ce user ────────────────
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update(body.data)
      .eq('id', member.id)
      .eq('auth_user_id', user.id); // Double sécurité

    if (updateError) {
      console.error('[api/member/update]', updateError);
      return NextResponse.json({ error: 'Erreur de mise à jour.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[api/member/update]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}