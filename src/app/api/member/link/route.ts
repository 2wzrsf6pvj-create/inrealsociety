// src/app/api/member/link/route.ts
// POST { memberId } — lie un profil legacy (sans auth_user_id) au compte Auth connecté.
// Protégé : session Supabase obligatoire.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';

const schema = z.object({
  memberId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'memberId invalide.' }, { status: 400 });
    }

    const { memberId } = body.data;

    // ─── Vérifie que ce user n'a pas déjà un profil ───────────────────────
    const { data: existingMember } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (existingMember) {
      return NextResponse.json({ error: 'Ce compte est déjà lié à un profil.' }, { status: 409 });
    }

    // ─── Vérifie que le membre cible est bien legacy (auth_user_id = null) ─
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, email, auth_user_id')
      .eq('id', memberId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Membre introuvable.' }, { status: 404 });
    }

    if (member.auth_user_id !== null) {
      return NextResponse.json({ error: 'Ce profil est déjà lié à un compte.' }, { status: 409 });
    }

    // ─── Sécurité : vérifie que l'email du compte Auth correspond au membre ─
    // Évite qu'un utilisateur A lie le profil d'un utilisateur B.
    if (member.email && user.email && member.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Ce profil ne correspond pas à votre compte.' }, { status: 403 });
    }

    // ─── Lie le profil au compte Auth ─────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('members')
      .update({ auth_user_id: user.id })
      .eq('id', memberId)
      .is('auth_user_id', null); // Double sécurité : uniquement si encore null

    if (updateError) {
      console.error('[api/member/link]', updateError);
      return NextResponse.json({ error: 'Erreur de liaison.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, memberId });

  } catch (err) {
    console.error('[api/member/link]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}