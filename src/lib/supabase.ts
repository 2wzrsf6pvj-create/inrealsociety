// src/lib/supabase.ts — InRealSociety
// Client anon pour les opérations publiques (lectures).
// Pour les mutations protégées, utiliser supabase-admin.ts via les routes API.

import { createClient } from '@supabase/supabase-js';
import type { Member, Scan } from './types';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ─── Membres (lectures) ──────────────────────────────────────────────────────

export async function getMemberById(id: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from('members').select('*').eq('id', id).single();
  if (error) return null;
  return data as Member;
}

export async function getMemberByAuthUserId(authUserId: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from('members').select('*').eq('auth_user_id', authUserId).single();
  if (error) return null;
  return data as Member;
}

// ─── Scans (lectures) ────────────────────────────────────────────────────────

export async function getRecentScans(memberId: string, limit = 10): Promise<Scan[]> {
  const { data, error } = await supabase.from('scans').select('*')
    .eq('member_id', memberId).order('scanned_at', { ascending: false }).limit(limit);
  if (error) return [];
  return data as Scan[];
}

export async function getFirstScanAt(memberId: string): Promise<string | null> {
  const { data } = await supabase
    .from('first_scans').select('first_scan_at').eq('member_id', memberId).single();
  return data?.first_scan_at ?? null;
}

