// src/lib/require-auth.ts
// Helper d'authentification pour les API routes.
// Extrait la session Supabase depuis les cookies de la requête.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { User } from '@supabase/supabase-js';

interface AuthResult {
  user: User;
}

/**
 * Vérifie que la requête provient d'un utilisateur authentifié.
 * Retourne le `user` Supabase Auth ou une NextResponse 401.
 */
export async function requireAuth(
  req: NextRequest,
): Promise<AuthResult | NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set() {}, remove() {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  return { user };
}

/**
 * Vérifie que le memberId appartient bien au user authentifié.
 * Retourne le member.id ou une NextResponse 403.
 */
export async function requireOwnership(
  userId: string,
  memberId: string,
): Promise<{ memberId: string } | NextResponse> {
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('auth_user_id', userId)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
  }

  return { memberId: member.id };
}

/** Type guard : vérifie si le résultat est une erreur HTTP */
export function isHttpError(result: unknown): result is NextResponse {
  return result instanceof NextResponse;
}
