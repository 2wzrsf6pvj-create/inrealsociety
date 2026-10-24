// src/lib/reports.ts
// Signalements de messages par les porteurs. SERVEUR UNIQUEMENT (supabaseAdmin).
// Enregistre le signalement (table message_reports, migration 056) et bannit
// l'appareil du passant dès que REPORT_BAN_THRESHOLD porteurs différents l'ont
// signalé.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { REPORT_BAN_THRESHOLD } from '@/lib/constants';

export interface ReportOutcome {
  /** Porteurs différents ayant signalé cet appareil (0 si appareil inconnu). */
  reporters: number;
  /** L'appareil est banni (seuil atteint, maintenant ou avant). */
  banned:    boolean;
}

/**
 * Appareil du passant derrière un message : le jeton est porté par le message
 * racine (les réponses n'en ont pas). Un message du porteur lui-même n'est
 * attribué à personne.
 */
export async function senderTokenOf(message: {
  author:        string | null;
  sender_token:  string | null;
  parent_id:     string | null;
}): Promise<string | null> {
  if (message.author === 'member') return null;
  if (message.sender_token) return message.sender_token;
  if (!message.parent_id) return null;
  const { data: root } = await supabaseAdmin
    .from('messages')
    .select('sender_token')
    .eq('id', message.parent_id)
    .maybeSingle();
  return root?.sender_token ?? null;
}

export async function recordReport(params: {
  messageId:   string;
  memberId:    string;
  senderToken: string | null;
}): Promise<ReportOutcome> {
  const { messageId, memberId, senderToken } = params;

  const { error } = await supabaseAdmin
    .from('message_reports')
    .insert({ message_id: messageId, member_id: memberId, sender_token: senderToken });
  // 23505 : ce porteur a déjà signalé cet appareil → il ne compte qu'une fois.
  if (error && error.code !== '23505') throw error;

  if (!senderToken) return { reporters: 0, banned: false };

  // Une ligne par (porteur, appareil) → le nombre de lignes EST le nombre de porteurs.
  const { count, error: countErr } = await supabaseAdmin
    .from('message_reports')
    .select('id', { count: 'exact', head: true })
    .eq('sender_token', senderToken);
  if (countErr) throw countErr;

  const reporters = count ?? 0;
  if (reporters < REPORT_BAN_THRESHOLD) return { reporters, banned: false };

  const { error: banErr } = await supabaseAdmin
    .from('banned_devices')
    .upsert(
      { sender_token: senderToken, reason: `auto\u00a0: signalé par ${reporters} porteurs` },
      { onConflict: 'sender_token', ignoreDuplicates: true },
    );
  if (banErr) throw banErr;
  return { reporters, banned: true };
}
