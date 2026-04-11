// src/lib/constants.ts — Valeurs partagées et centralisées

/** URL de l'application (serveur et client) */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';

/** Email expéditeur pour les emails transactionnels */
export const EMAIL_FROM = 'InRealSociety <noreply@inrealsociety.com>';

/** URL de l'API Resend */
export const RESEND_API_URL = 'https://api.resend.com/emails';
