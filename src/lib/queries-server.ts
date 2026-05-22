// src/lib/queries-server.ts
// Lectures serveur privilégiées — SERVEUR UNIQUEMENT (importe supabaseAdmin).
// Ne jamais importer dans du code client ('use client').
//
// Pourquoi admin : ces lectures touchent soit des colonnes members revoke pour
// anon/authenticated (email/stripe_*/plan_expires_at — migrations 026/030), soit
// des tables owner-only (scans, first_scans — migrations 006). Sous le client
// anon sans session, elles échoueraient (permission denied) ou renverraient vide.
//
// L'ownership est garanti en amont par les appelants :
//   * /dashboard/[memberId] → redirect si mauvais compte
//   * /dashboard            → résolu depuis auth.uid()
// Pour le profil PUBLIC, ne PAS utiliser getMemberById (renvoie email/stripe) :
// utiliser getPublicMember() de supabase.ts (colonnes publiques uniquement).

import { supabaseAdmin } from './supabase-admin';
import type { Member, Scan } from './types';

export async function getMemberById(id: string): Promise<Member | null> {
  const { data, error } = await supabaseAdmin
    .from('members').select('*').eq('id', id).single();
  if (error) return null;
  return data as Member;
}

/** Renvoie l'auth_user_id du membre (pour calculer l'ownership sans l'exposer au client). */
export async function isProfileOwner(memberId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('members').select('auth_user_id').eq('id', memberId).single();
  return !!data && data.auth_user_id === userId;
}

export async function getRecentScans(memberId: string, limit = 10): Promise<Scan[]> {
  const { data, error } = await supabaseAdmin.from('scans').select('*')
    .eq('member_id', memberId).order('scanned_at', { ascending: false }).limit(limit);
  if (error) return [];
  return data as Scan[];
}

export async function getFirstScanAt(memberId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('first_scans').select('first_scan_at').eq('member_id', memberId).single();
  return data?.first_scan_at ?? null;
}

export async function getScansByDay(memberId: string, days = 7): Promise<{ date: string; count: number }[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
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
