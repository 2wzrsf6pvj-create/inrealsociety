// Liste centralisée des events PostHog. Garde les noms strictement typés
// pour qu'on ne pollue jamais le projet PostHog avec des typos.

export type AnalyticsEvent =
  // Acquisition (côté scanner)
  | 'profile_viewed'
  | 'scan_submitted'
  | 'message_submitted'
  | 'message_blocked_conversation_limit'
  | 'message_blocked_window_expired'
  // Activation (côté membre)
  | 'member_dashboard_viewed'
  // Conversion premium
  | 'upgrade_cta_viewed'
  | 'upgrade_clicked'
  | 'subscription_active'
  | 'subscription_cancelled';

export interface AnalyticsProperties {
  member_id?:    string;
  plan?:         'free' | 'premium';
  scan_count?:   number;
  source?:       string;
  reason?:       string;
  [key: string]: unknown;
}
