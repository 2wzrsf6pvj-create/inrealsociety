// src/lib/feedback-digest.ts — Avis, pour /admin (test terrain) : les derniers
// écrits depuis « Votre avis » dans « Mon espace », et les notes laissées à la
// fin d'une conversation. Enregistrés par /api/feedback ; jusqu'ici, on ne les
// lisait qu'en SQL. SERVEUR UNIQUEMENT.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { STATS_WINDOW_DAYS } from '@/lib/field-stats';

/** Avis écrits affichés, les plus récents d'abord. */
export const NOTES_SHOWN = 20;

export type Rating = 'positive' | 'neutral' | 'negative';

export interface FeedbackDigest {
  notes: {
    id:        string;
    createdAt: string;
    message:   string;
    /** Porteur connecté qui l'a écrit ; null : compte supprimé, ou envoyé sans session. */
    member:    { id: string; name: string | null } | null;
  }[];
  /** Notes de fin de conversation, ces STATS_WINDOW_DAYS derniers jours. */
  ratings: Record<Rating, number>;
}

const RATINGS: Rating[] = ['positive', 'neutral', 'negative'];

export async function loadFeedbackDigest(now = new Date()): Promise<FeedbackDigest> {
  const since = new Date(now.getTime() - STATS_WINDOW_DAYS * 86_400_000).toISOString();
  const [notes, ...counts] = await Promise.all([
    supabaseAdmin.from('feedback').select('id, created_at, message, member_id')
      .eq('type', 'app').order('created_at', { ascending: false }).limit(NOTES_SHOWN),
    ...RATINGS.map((rating) => supabaseAdmin.from('feedback').select('id', { count: 'exact', head: true })
      .eq('type', 'conversation').eq('rating', rating).gte('created_at', since)),
  ]);
  const failed = [notes, ...counts].find((r) => r.error);
  if (failed?.error) throw new Error(`[feedback-digest] ${failed.error.message}`);

  const rows = (notes.data ?? []) as { id: string; created_at: string; message: string | null; member_id: string | null }[];
  const ids = [...new Set(rows.map((r) => r.member_id).filter((id): id is string => !!id))];
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data, error } = await supabaseAdmin.from('members').select('id, name').in('id', ids);
    if (error) throw new Error(`[feedback-digest] porteurs : ${error.message}`);
    for (const m of (data ?? []) as { id: string; name: string | null }[]) names.set(m.id, m.name);
  }

  return {
    notes: rows.filter((r) => r.message?.trim()).map((r) => ({
      id:        r.id,
      createdAt: r.created_at,
      message:   r.message!.trim(),
      member:    r.member_id && names.has(r.member_id) ? { id: r.member_id, name: names.get(r.member_id) ?? null } : null,
    })),
    ratings: Object.fromEntries(RATINGS.map((rating, i) => [rating, counts[i].count ?? 0])) as Record<Rating, number>,
  };
}
