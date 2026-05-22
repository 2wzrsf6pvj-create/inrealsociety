// src/lib/constants.ts — Valeurs partagées et centralisées

/** URL de l'application (serveur et client) */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';

/** Email expéditeur pour les emails transactionnels */
export const EMAIL_FROM = 'InRealSociety <noreply@inrealsociety.com>';

/** URL de l'API Resend */
export const RESEND_API_URL = 'https://api.resend.com/emails';

// ─── Premium ─────────────────────────────────────────────────────────────────

/** Durée de la fenêtre scanner selon le plan */
export const SCAN_WINDOW_MS = {
  free:    24 * 60 * 60 * 1000,  // 24h
  premium: 48 * 60 * 60 * 1000,  // 48h
} as const;

/** Nombre max de conversations actives selon le plan */
export const MAX_CONVERSATIONS = {
  free:    3,
  premium: Infinity,
} as const;

// ─── Conversation thread ───────────────────────────────────────────────────────

/** Nombre max de messages dans un thread (message racine inclus). Garde le côté
 *  éphémère — au-delà, la suite se passe ailleurs. */
export const MAX_THREAD_MESSAGES = 5;

/** Réponses rapides qui bypassent la modération (envoi en 1 tap). */
export const QUICK_REPLIES = ["Belle audace.", "J'aime la démarche.", "👁"] as const;
