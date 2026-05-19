// src/lib/supabase-admin.ts
// Client Supabase avec Service Role — bypasse RLS, SERVEUR UNIQUEMENT.
// Ne jamais importer dans du code client ('use client').
// Nécessite : SUPABASE_SERVICE_ROLE_KEY dans .env.local

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