// src/lib/admin.ts — Accès à l'administration de la modération (/admin).
// SERVEUR UNIQUEMENT. Réservé aux emails listés dans ADMIN_EMAILS (séparés par
// des virgules), adresse confirmée exigée : sinon, n'importe qui pourrait
// s'inscrire avec l'email de l'équipe avant elle.

import type { User } from '@supabase/supabase-js';

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: Pick<User, 'email' | 'email_confirmed_at'> | null | undefined): boolean {
  if (!user?.email || !user.email_confirmed_at) return false;
  return adminEmails().includes(user.email.toLowerCase());
}
