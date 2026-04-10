// src/lib/audit.ts
// Logging des actions sensibles dans la table audit_logs.
// Utilise le service role — toujours côté serveur uniquement.
// Fire-and-forget : ne bloque jamais la réponse principale.

import { supabase } from '@/lib/supabase';

export type AuditAction =
  | 'message.sent'
  | 'message.moderated'
  | 'message.read'
  | 'message.starred'
  | 'reply.sent'
  | 'scan.recorded'
  | 'scan.rate_limited'
  | 'message.rate_limited'
  | 'dashboard.accessed'
  | 'qrcode.generated'
  | 'order.completed'
  | 'push.subscribed';

interface AuditParams {
  action:    AuditAction;
  memberId?: string;
  ip?:       string;
  metadata?: Record<string, unknown>;
}

/**
 * Enregistre une action dans audit_logs.
 * Toujours appelé en fire-and-forget — ne throw jamais.
 */
export function audit(params: AuditParams): void {
  supabase.from('audit_logs').insert({
    action:    params.action,
    member_id: params.memberId ?? null,
    ip:        params.ip ?? null,
    metadata:  params.metadata ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[audit] Échec insertion log:', error.message);
  });
}