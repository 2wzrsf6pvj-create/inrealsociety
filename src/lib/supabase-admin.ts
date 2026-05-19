// src/lib/supabase-admin.ts
// Client Supabase avec Service Role — bypasse RLS, SERVEUR UNIQUEMENT.
// Ne jamais importer dans du code client ('use client').
// Nécessite : SUPABASE_SERVICE_ROLE_KEY dans .env.local

import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken:  false,
      persistSession:    false,
    },
  }
);