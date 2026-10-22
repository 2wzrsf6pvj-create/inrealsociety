// src/lib/types.ts — InRealSociety

export type MemberPlan = 'free' | 'premium';

export interface Member {
  id:                      string;
  name:                    string;
  pitch:                   string;
  instagram:               string | null;
  email:                   string | null;
  photo_url:               string | null;
  scan_count:              number;
  is_paused:               boolean;
  // Suspension opérateur (migration 054) : implique is_paused, non levable par le
  // porteur. Absent des lectures publiques (allowlist de colonnes).
  suspended_at?:           string | null;
  require_contact:         boolean;
  plan:                    MemberPlan;
  stripe_customer_id:      string | null;
  stripe_subscription_id:  string | null;
  plan_expires_at:         string | null;
  marketing_consent:       boolean;
  marketing_consent_at:    string | null;
  created_at:              string;
  updated_at:              string;
  auth_user_id:            string | null;
}

export interface Scan {
  id:            string;
  member_id:     string;
  scanner_name:  string | null;
  scanned_at:    string;
  first_scan_at: string | null;
  latitude:      number | null;
  longitude:     number | null;
  location:      string | null;
}

export interface Message {
  id:             string;
  member_id:      string;
  content:        string;
  sender_contact: string | null;
  // Prénom optionnel du scanneur (migration 039) — humanise le signal côté
  // porteur. null = scanneur anonyme.
  sender_name:    string | null;
  is_quick_reply: boolean;
  moderated:      boolean;
  read_at:        string | null;
  // Champs dérivés du thread, exposés uniquement via la vue member_inbox
  // (migration 025). Optionnels car absents des queries directes sur la
  // table messages après la migration 029 (drop des colonnes legacy).
  reply?:         string | null;
  replied_at?:    string | null;
  reply_read_at?: string | null;
  // Exposé par la vue member_inbox (migration 038) — conv fermée par blocage.
  blocked_at?:    string | null;
  created_at:     string;
}

export type CreateMemberPayload = Pick<Member, 'name' | 'pitch' | 'instagram' | 'email'>;