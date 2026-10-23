// src/lib/phone.ts — Téléphone du porteur, relevé par le serveur à chaque
// ouverture de « Mon espace » (choix de Clément) : iPhone ou Android, et
// première ouverture depuis l'app installée. Mesure, pendant le test terrain,
// combien de porteurs sur iPhone installent l'app, seule façon d'y recevoir les
// notifications. Rien n'est relevé depuis un ordinateur. SERVEUR UNIQUEMENT.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@/lib/wait-until';
import type { Member, PhoneOs } from '@/lib/types';

type PhoneColumns = Pick<Member, 'phone_os' | 'app_installed_at'>;

/** iPhone (iPad et iPod compris) ou Android. Un iPad récent se présente comme
 *  un Mac : il compte comme un ordinateur. */
export function phoneOs(userAgent: string | null): PhoneOs | null {
  if (!userAgent) return null;
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return null;
}

/** Ce qui change sur le porteur, null s'il n'y a rien à écrire (le plus
 *  souvent). Rien tant que la migration 062 n'est pas appliquée : les colonnes
 *  manquent alors au profil lu. */
export function phoneUpdate(
  member: PhoneColumns, userAgent: string | null, fromApp: boolean, now: Date,
): PhoneColumns | null {
  if (!('phone_os' in member)) return null;
  const os = phoneOs(userAgent);
  if (!os) return null;
  const patch: PhoneColumns = {};
  if (member.phone_os !== os) patch.phone_os = os;
  if (fromApp && !member.app_installed_at) patch.app_installed_at = now.toISOString();
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Erreur Postgres « colonne inconnue » : la migration 062 n'est pas encore
 *  appliquée. /admin l'affiche au lieu d'échouer. */
export function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42703';
}

/** Écrit le changement sans retarder la page : un échec n'empêche jamais
 *  d'afficher « Mon espace ». */
export function recordPhone(member: Member, userAgent: string | null, fromApp: boolean, now = new Date()): void {
  const patch = phoneUpdate(member, userAgent, fromApp, now);
  if (!patch) return;
  const write = Promise.resolve(supabaseAdmin.from('members').update(patch).eq('id', member.id)).then(
    ({ error }) => { if (error) console.warn('[phone] Relevé impossible :', error.message); },
    (err) => console.warn('[phone] Relevé rejeté :', err),
  );
  waitUntil(write);
}
