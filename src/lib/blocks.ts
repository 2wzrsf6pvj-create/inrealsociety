// src/lib/blocks.ts
// Logique de blocage porteur → device scanneur. SERVEUR UNIQUEMENT (importe
// supabaseAdmin). Ne jamais importer dans du code client ('use client').
// Source unique pour /api/message, /api/conversation/reply et /api/conversation/block.

import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Ce device (sender_token) est-il bloqué par ce porteur ?
 * Sans jeton, on ne peut rien affirmer → false (fail-open assumé : un nouveau
 * device n'a jamais été bloqué, faute d'historique).
 */
export async function isBlocked(memberId: string, senderToken: string | null): Promise<boolean> {
  if (!senderToken) return false;
  const { data } = await supabaseAdmin
    .from('blocks')
    .select('id')
    .eq('member_id', memberId)
    .eq('sender_token', senderToken)
    .maybeSingle();
  return !!data;
}

/**
 * Ce device (sender_token) est-il banni GLOBALEMENT (tous porteurs) ?
 * Anti-harcèlement en série : un device banni par l'ops ne peut plus écrire à
 * personne. Distinct de isBlocked (par-porteur). Sans jeton → false.
 */
export async function isDeviceBanned(senderToken: string | null): Promise<boolean> {
  if (!senderToken) return false;
  const { data } = await supabaseAdmin
    .from('banned_devices')
    .select('sender_token')
    .eq('sender_token', senderToken)
    .maybeSingle();
  return !!data;
}

/**
 * Bloque une conversation : la ferme (blocked_at) et, si le device est connu,
 * enregistre le blocage (member_id, sender_token) pour couper tout re-contact.
 */
export async function blockConversation(params: {
  memberId:     string;
  messageId:    string;
  senderToken:  string | null;
}): Promise<void> {
  const { memberId, messageId, senderToken } = params;

  const { error: msgErr } = await supabaseAdmin
    .from('messages')
    .update({ blocked_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('member_id', memberId)
    .is('parent_id', null);
  if (msgErr) throw msgErr;

  if (senderToken) {
    // ON CONFLICT (member_id, sender_token) DO NOTHING via upsert ignoreDuplicates.
    const { error: blockErr } = await supabaseAdmin
      .from('blocks')
      .upsert(
        { member_id: memberId, sender_token: senderToken, message_id: messageId },
        { onConflict: 'member_id,sender_token', ignoreDuplicates: true },
      );
    if (blockErr) throw blockErr;
  }
}

/** Débloque : rouvre la conversation et retire le blocage device. */
export async function unblockConversation(params: {
  memberId:     string;
  messageId:    string;
  senderToken:  string | null;
}): Promise<void> {
  const { memberId, messageId, senderToken } = params;

  const { error: msgErr } = await supabaseAdmin
    .from('messages')
    .update({ blocked_at: null })
    .eq('id', messageId)
    .eq('member_id', memberId)
    .is('parent_id', null);
  if (msgErr) throw msgErr;

  if (senderToken) {
    const { error: blockErr } = await supabaseAdmin
      .from('blocks')
      .delete()
      .eq('member_id', memberId)
      .eq('sender_token', senderToken);
    if (blockErr) throw blockErr;
  }
}
