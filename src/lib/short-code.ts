// src/lib/short-code.ts
// Génère des codes courts uniques pour les URLs de QR code.
// Commence à 5 caractères (30^5 ≈ 24 millions de codes), allonge en cas de
// collision. Avant : 2 caractères, soit quelques centaines de codes qu'on
// pouvait tous essayer pour trouver les profils sans croiser personne.
// La taille du QR ne change pas : « https://inreal.me/ » + 2 à 6 caractères
// tient dans la même version (3, soit 29×29 modules en correction H).
//
// Alphabet : a-z 0-9 (minuscules uniquement, pas d'ambiguïté visuelle)
// Exclusions : 0/o, 1/l/i pour éviter la confusion à la lecture.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { APP_URL } from '@/lib/constants';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz2345678'; // 30 chars, sans ambiguïtés
const MIN_LENGTH = 5;
const MAX_LENGTH = 6;
const MAX_ATTEMPTS = 20;

function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Génère un short_code unique pour un membre OU une commande.
 * Tente d'abord avec 2 caractères (29^2 = 841 combinaisons),
 * puis allonge progressivement si collision.
 *
 * ⚠️ Unicité GLOBALE : le code peut être réservé sur une commande
 * (orders.short_code, au paiement) AVANT d'exister sur un membre
 * (members.short_code, à l'activation). On vérifie donc les DEUX tables, sinon
 * une réservation de commande pourrait entrer en collision avec un code membre
 * (ou l'inverse) et le QR imprimé pointerait vers le mauvais profil.
 *
 * @returns Le code court unique (ex: 'u8', 'k3f', 'ab7x')
 */
export async function generateUniqueShortCode(): Promise<string> {
  for (let length = MIN_LENGTH; length <= MAX_LENGTH; length++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = randomCode(length);

      // Vérifie l'unicité dans les DEUX tables. maybeSingle (pas single) : 0 ligne
      // = code libre, le cas NORMAL — single y émet une erreur PGRST116 qui
      // polluait les logs à chaque code unique.
      const [{ data: memberHit }, { data: orderHit }] = await Promise.all([
        supabaseAdmin.from('members').select('id').eq('short_code', code).maybeSingle(),
        supabaseAdmin.from('orders').select('id').eq('short_code', code).maybeSingle(),
      ]);

      // Pas de collision (ni membre ni commande) → le code est disponible
      if (!memberHit && !orderHit) return code;
    }
    // Toutes les tentatives à cette longueur ont échoué → on allonge
  }

  throw new Error(`Impossible de générer un short_code unique après ${MAX_ATTEMPTS * (MAX_LENGTH - MIN_LENGTH + 1)} tentatives.`);
}

/**
 * Construit l'URL courte complète pour un QR code.
 * Utilise SHORT_DOMAIN si configuré, sinon fallback sur l'app URL.
 *
 * @param shortCode - Le code court du membre (ex: 'u8')
 * @returns URL complète (ex: 'https://inreal.me/u8' ou 'https://inrealsociety.vercel.app/r/u8')
 */
export function buildShortUrl(shortCode: string): string {
  const shortDomain = process.env.SHORT_DOMAIN; // ex: https://inreal.me
  if (shortDomain) {
    // Retire un éventuel slash final pour éviter 'https://inreal.me//u8'
    // (URL imprimée sur le t-shirt → doit être impeccable). Le domaine court
    // doit router /{code} vers /r/{code}.
    return `${shortDomain.replace(/\/$/, '')}/${shortCode}`;
  }
  const appUrl = APP_URL;
  return `${appUrl}/r/${shortCode}`;
}
