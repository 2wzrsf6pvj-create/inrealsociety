// src/lib/referral.ts
// Parrain derrière un lien de parrainage. SERVEUR UNIQUEMENT (supabaseAdmin) :
// referral_code n'est pas lisible côté client (allowlist de la 042), pour que le
// lien ne mène jamais à l'identifiant du profil.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isReferralToken, isLegacyReferral } from '@/lib/referral-code';

export interface Referrer {
  id:    string;
  name:  string;
  email: string | null;
}

/** Le parrain derrière un code (ou un ancien lien à identifiant), ou null. */
export async function resolveReferrer(token: unknown): Promise<Referrer | null> {
  if (!isReferralToken(token)) return null;
  const { data } = await supabaseAdmin
    .from('members')
    .select('id, name, email')
    .eq(isLegacyReferral(token) ? 'id' : 'referral_code', token)
    .maybeSingle();
  return (data as Referrer | null) ?? null;
}
