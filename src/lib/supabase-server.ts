// lib/supabase-server.ts
// Client Supabase pour les Server Components, API Routes et Middleware

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component — les cookies en écriture sont ignorés silencieusement
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

// Helper : récupère la session utilisateur côté serveur
export async function getSession() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Helper : récupère l'utilisateur authentifié (plus sécurisé que getSession)
export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}