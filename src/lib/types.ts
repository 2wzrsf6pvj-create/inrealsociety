// src/lib/types.ts — InRealSociety

export interface Member {
  id:           string;
  name:         string;
  pitch:        string;
  instagram:    string | null;
  email:        string | null;
  photo_url:    string | null;
  scan_count:   number;
  is_paused:    boolean;
  created_at:   string;
  updated_at:   string;
  auth_user_id: string | null;  // ← ajouté
}

export interface Scan {
  id:            string;
  member_id:     string;
  scanner_name:  string | null;
  scanned_at:    string;
  first_scan_at: string | null;
}

export interface Message {
  id:             string;
  member_id:      string;
  content:        string;
  sender_contact: string | null;
  is_quick_reply: boolean;
  moderated:      boolean;
  read_at:        string | null;
  reply:          string | null;
  replied_at:     string | null;
  reply_read_at:  string | null;
  created_at:     string;
}

export type CreateMemberPayload = Pick<Member, 'name' | 'pitch' | 'instagram' | 'email'>;