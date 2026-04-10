// src/lib/short-code.ts
// Génère des codes courts uniques pour les URLs de QR code.
// Commence à 2 caractères, allonge automatiquement en cas de collision.
//
// Alphabet : a-z 0-9 (minuscules uniquement, pas d'ambiguïté visuelle)
// Exclusions : 0/o, 1/l/i pour éviter la confusion à la lecture.

import { supabaseAdmin } from '@/lib/supabase-admin';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz2345678'; // 29 chars, sans ambiguïtés
const MIN_LENGTH = 2;
const MAX_LENGTH = 6;
const MAX_ATTEMPTS = 20;

function randomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Génère un short_code unique pour un membre.
 * Tente d'abord avec 2 caractères (29^2 = 841 combinaisons),
 * puis allonge progressivement si collision.
 *
 * @returns Le code court unique (ex: 'u8', 'k3f', 'ab7x')
 */
export async function generateUniqueShortCode(): Promise<string> {
  for (let length = MIN_LENGTH; length <= MAX_LENGTH; length++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = randomCode(length);

      // Vérifie l'unicité dans la BDD
      const { data } = await supabaseAdmin
        .from('members')
        .select('id')
        .eq('short_code', code)
        .single();

      // Pas de collision → le code est disponible
      if (!data) return code;
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
    return `${shortDomain}/${shortCode}`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';
  return `${appUrl}/r/${shortCode}`;
}
