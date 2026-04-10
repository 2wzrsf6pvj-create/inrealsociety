// src/lib/supabase.ts — InRealSociety
// Client anon pour les opérations publiques côté serveur/client.
// Pour les opérations admin (bypass RLS), utiliser supabase-admin.ts.

import { createClient } from '@supabase/supabase-js';
import type { Member, Scan, Message } from './types';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ─── Membres ───────────────────────────────────────────────────────────────────

export async function getMemberById(id: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from('members').select('*').eq('id', id).single();
  if (error) return null;
  return data as Member;
}

/** Récupère le membre lié à un compte Supabase Auth (pour le dashboard session) */
export async function getMemberByAuthUserId(authUserId: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from('members').select('*').eq('auth_user_id', authUserId).single();
  if (error) return null;
  return data as Member;
}

export async function createMember(payload: {
  name: string; pitch: string; instagram?: string; email?: string; authUserId?: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('members')
    .insert({
      name:         payload.name,
      pitch:        payload.pitch,
      instagram:    payload.instagram || null,
      email:        payload.email || null,
      auth_user_id: payload.authUserId || null,
    })
    .select('id').single();
  if (error) { console.error('[supabase] createMember:', error.message); return null; }
  return data.id as string;
}

export async function updateMember(
  id: string,
  payload: Partial<Pick<Member, 'name' | 'pitch' | 'instagram' | 'email' | 'is_paused'>>
): Promise<boolean> {
  const { error } = await supabase.from('members').update(payload).eq('id', id);
  if (error) { console.error('[supabase] updateMember:', error.message); return false; }
  return true;
}

// ─── Scans ─────────────────────────────────────────────────────────────────────

export async function recordScan(memberId: string, scannerName?: string): Promise<boolean> {
  const { error } = await supabase.from('scans')
    .insert({ member_id: memberId, scanner_name: scannerName || null });

  if (error && error.code !== '23505') {
    console.error('[supabase] recordScan:', error.message);
    return false;
  }

  await supabase.rpc('increment_scan_count', { member_id: memberId });
  return true;
}

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

export async function getScansPerDay(memberId: string): Promise<{ day: string; count: number }[]> {
  const { data, error } = await supabase.from('scans_per_day').select('*')
    .eq('member_id', memberId).limit(14);
  if (error) return [];
  return (data || []).map((r: { day: string; count: number }) => ({
    day:   new Date(r.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    count: r.count,
  }));
}

// ─── Messages ──────────────────────────────────────────────────────────────────

export async function getMessages(memberId: string, limit = 20): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('member_id', memberId)
    .eq('moderated', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as Message[];
}

export async function getMessageById(messageId: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages').select('*').eq('id', messageId).single();
  if (error) return null;
  return data as Message;
}

export async function markMessageRead(messageId: string): Promise<void> {
  await supabase.from('messages')
    .update({ read_at: new Date().toISOString() }).eq('id', messageId);
}

// ─── Codes d'activation ────────────────────────────────────────────────────────
// ⚠️ Ces fonctions ne fonctionnent que côté serveur avec le service role.
// Depuis le client, passer par /api/activate.

export async function validateActivationCode(code: string): Promise<boolean> {
  const { data } = await supabase.from('activation_codes')
    .select('used').eq('code', code.toUpperCase()).single();
  return !!data && !data.used;
}

export async function markCodeUsed(code: string, memberId: string): Promise<void> {
  await supabase.from('activation_codes')
    .update({ used: true, member_id: memberId }).eq('code', code.toUpperCase());
}