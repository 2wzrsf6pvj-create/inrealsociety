// lib/supabase-server.ts
// Client Supabase pour les Server Components, API Routes et Middleware

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
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

// Helper : récupère l'utilisateur authentifié (validé côté serveur).
// NB : on n'expose volontairement PAS de helper getSession() — getSession lit le
// cookie sans le valider (spoofable) ; toute décision d'autorisation doit passer
// par getUser() (vérifié auprès de Supabase).
export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}