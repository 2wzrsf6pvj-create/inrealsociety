// lib/supabase-browser.ts
// Client Supabase pour les Client Components ('use client')
// Nécessite : npm install @supabase/ssr @supabase/supabase-js

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config';

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}