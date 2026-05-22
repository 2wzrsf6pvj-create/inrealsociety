// src/lib/supabase.ts — InRealSociety
// Client anon pour les opérations publiques (lectures sûres sous RLS).
// Pour les mutations protégées et les lectures privilégiées : supabase-admin.ts
// (via queries-server.ts / inbox.ts) ou le client authentifié serveur.

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config';
import type { Member } from './types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Membres (lectures) ──────────────────────────────────────────────────────

// Profil PUBLIC : colonnes non-sensibles uniquement (lisibles par anon sous la
// policy members_select_public, et sûres à sérialiser vers le navigateur). Les
// colonnes revoke (email/stripe_*/plan_expires_at/auth_user_id) sont forcées à
// null pour garantir qu'elles ne fuitent jamais côté client.
export async function getPublicMember(id: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from('members')
    .select('id, name, pitch, instagram, photo_url, scan_count, is_paused, require_contact, plan, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return {
    ...data,
    email:                  null,
    stripe_customer_id:     null,
    stripe_subscription_id: null,
    plan_expires_at:        null,
    marketing_consent:      false,
    marketing_consent_at:   null,
    auth_user_id:           null,
  } as Member;
}

// Profil COMPLET du membre authentifié. Doit recevoir le client serveur
// authentifié (porteur du cookie de session) : la RPC get_own_member() s'appuie
// sur auth.uid(). Appelée avec le singleton anon, elle renverrait toujours null.
export async function getMemberByAuthUserId(client: SupabaseClient): Promise<Member | null> {
  // SECURITY DEFINER RPC (migration 030) — bypass le column-level REVOKE sur
  // email/stripe_*/plan_expires_at pour permettre au membre de lire son propre
  // profil complet sans exposer ces colonnes aux autres utilisateurs.
  const { data, error } = await client.rpc('get_own_member').single();
  if (error || !data) return null;
  return data as Member;
}

// NB : getMemberById (complet, propriétaire), getRecentScans, getFirstScanAt et
// getScansByDay vivent dans queries-server.ts (supabaseAdmin) — elles touchent
// des colonnes/tables owner-only et ce fichier est importé côté client.
