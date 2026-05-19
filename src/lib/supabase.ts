// src/lib/supabase.ts — InRealSociety
// Client anon pour les opérations publiques (lectures).
// Pour les mutations protégées, utiliser supabase-admin.ts via les routes API.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config';
import type { Member, Scan, Message } from './types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// ─── Messages (lectures) ─────────────────────────────────────────────────────

export async function getMessages(memberId: string, limit = 20, offset = 0): Promise<Message[]> {
  // Lit la vue member_inbox qui filtre les top-level (parent_id IS NULL) et
  // expose reply / replied_at / reply_read_at dérivés du thread.
  const { data, error } = await supabase
    .from('member_inbox')
    .select('*')
    .eq('member_id', memberId)
    .eq('moderated', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return data as Message[];
}

export async function getMessagesCount(memberId: string): Promise<number> {
  // Compte les conversations actives = messages racine uniquement (pas le thread).
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('moderated', false)
    .is('parent_id', null);
  if (error) return 0;
  return count ?? 0;
}

export async function getScansByDay(memberId: string, days = 7): Promise<{ date: string; count: number }[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('scans')
    .select('scanned_at')
    .eq('member_id', memberId)
    .gte('scanned_at', since)
    .order('scanned_at', { ascending: true });
  if (error || !data) return [];

  const byDay: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of data) {
    const key = new Date(row.scanned_at).toISOString().slice(0, 10);
    if (key in byDay) byDay[key]++;
  }
  return Object.entries(byDay).map(([date, count]) => ({ date, count }));
}

export async function getUnreadMessagesCount(memberId: string): Promise<number> {
  // Compte les messages racine non lus uniquement (pas les replies dans le thread).
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('moderated', false)
    .is('read_at', null)
    .is('parent_id', null);
  if (error) return 0;
  return count ?? 0;
}

