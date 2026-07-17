// src/lib/supabase-admin.ts
// Client Supabase avec Service Role — bypasse RLS, SERVEUR UNIQUEMENT.
// Ne jamais importer dans du code client ('use client').
// Nécessite : SUPABASE_SERVICE_ROLE_KEY dans .env.local

// NB : l'import de ce module côté client est déjà interdit structurellement par
// `security-client.test.ts` (échoue le CI si un composant client l'importe). Le
// paquet `server-only` (garde à la compilation) n'est pas installé ici — à ajouter
// si on veut un second filet au build.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './supabase-config';

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken:  false,
      persistSession:    false,
    },
  }
);