// src/app/api/member/create/route.ts
// POST { name, pitch, instagram?, activationCode }
// Crée un membre lié à l'utilisateur authentifié (auth_user_id = auth.uid()).
// Protégé : session Supabase obligatoire.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';

const schema = z.object({
  name:           z.string().min(1).max(50).trim(),
  pitch:          z.string().min(1).max(500).trim(),
  instagram:      z.string().max(50).optional(),
  activationCode: z.string().min(6).max(12).toUpperCase(),
});

export async function POST(req: NextRequest) {
  try {
    // ─── Vérification session ─────────────────────────────────────────────
    const res = new Response();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return req.cookies.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {},
          remove(name: string, options: CookieOptions) {},
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

    const { name, pitch, instagram, activationCode } = body.data;

    // ─── Vérification code d'activation ──────────────────────────────────
    const { data: codeData } = await supabaseAdmin
      .from('activation_codes')
      .select('code, used')
      .eq('code', activationCode)
      .single();

    if (!codeData || codeData.used) {
      return NextResponse.json({ error: 'Code invalide ou déjà utilisé.' }, { status: 400 });
    }

    // ─── Vérifie si ce user a déjà un profil ─────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({ memberId: existing.id, alreadyExists: true });
    }

    // ─── Création du membre lié au compte auth ────────────────────────────
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .insert({
        name,
        pitch,
        instagram:    instagram?.trim() || null,
        email:        user.email || null,
        auth_user_id: user.id,
      })
      .select('id')
      .single();

    if (memberError || !member) {
      console.error('[api/member/create]', memberError);
      return NextResponse.json({ error: 'Erreur création profil.' }, { status: 500 });
    }

    // ─── Marque le code comme utilisé ────────────────────────────────────
    await supabaseAdmin
      .from('activation_codes')
      .update({ used: true, member_id: member.id })
      .eq('code', activationCode);

    return NextResponse.json({ memberId: member.id });

  } catch (err) {
    console.error('[api/member/create]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}