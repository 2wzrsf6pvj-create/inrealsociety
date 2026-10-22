// src/lib/inbox.ts
// Lectures de l'inbox membre — SERVEUR UNIQUEMENT (importe supabaseAdmin).
// Ne jamais importer dans du code client ('use client').
//
// Pourquoi admin et pas le client authentifié : la RLS messages_select_own
// matche auth.uid(). Les membres legacy (auth_user_id null, accès par UUID)
// n'ont pas de session → ils verraient une inbox vide sous le client anon/auth.
// L'ownership est déjà vérifié en amont :
//   * page dashboard → redirect si mauvais compte
//   * /api/messages  → requireOwnership
// (Ces fonctions vivaient dans supabase.ts, mais ce fichier est importé côté
//  client — impossible d'y mettre le service-role.)

import { supabaseAdmin } from './supabase-admin';
import { CONVERSATION_WINDOW_DAYS } from './constants';
import type { Message } from './types';

export async function getMessages(memberId: string, limit = 20, offset = 0): Promise<Message[]> {
  // Lit la vue member_inbox qui filtre les top-level (parent_id IS NULL) et
  // expose reply / replied_at / reply_read_at dérivés du thread.
  const { data, error } = await supabaseAdmin
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
  // Exclut les conv bloquées — cohérent avec le plafond appliqué dans /api/message.
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('moderated', false)
    .is('parent_id', null)
    .is('blocked_at', null);
  if (error) return 0;
  return count ?? 0;
}

// Conversations qui occupent un créneau du plafond (MAX_CONVERSATIONS) : racine,
// non modérées, non bloquées, ouvertes sur les CONVERSATION_WINDOW_DAYS derniers
// jours. Source UNIQUE pour /api/message (application) et l'inbox (bandeau).
// Distinct de getMessagesCount, qui reste un cumul (stat « Conversations »).
// Fail-open sur erreur (0) : comme avant, un incident BDD ne coupe pas les messages.
export async function getActiveConversationsCount(memberId: string): Promise<number> {
  const since = new Date(Date.now() - CONVERSATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('moderated', false)
    .is('parent_id', null)
    .is('blocked_at', null)
    .gte('created_at', since);
  if (error) return 0;
  return count ?? 0;
}

// Total des conversations AFFICHÉES dans l'inbox (racine, non modérées, BLOQUÉES
// INCLUSES) — sert à la pagination « Voir plus ». Distinct de getMessagesCount
// (actives, hors bloquées) qui pilote le plafond premium : les conv bloquées
// apparaissent dans la liste (avec badge) mais ne comptent pas comme actives.
export async function getConversationsTotal(memberId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('moderated', false)
    .is('parent_id', null);
  if (error) return 0;
  return count ?? 0;
}

export async function getUnreadMessagesCount(memberId: string): Promise<number> {
  // Compte les messages racine non lus uniquement (pas les replies dans le thread).
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('moderated', false)
    .is('read_at', null)
    .is('parent_id', null);
  if (error) return 0;
  return count ?? 0;
}
