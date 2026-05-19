// Helpers partagés entre les sections du dashboard.
// Pas de React imports — purement utilitaire.

import type { Scan } from '@/lib/types';

export function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function daysActive(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

export function recentScansCount(scans: Scan[]): number {
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  return scans.filter(s => new Date(s.scanned_at).getTime() > sevenDaysAgo).length;
}

const WAITING_PHRASES = [
  "Portez votre t-shirt et laissez le hasard faire.",
  "Votre profil est prêt. La prochaine rencontre commence dehors.",
  "Aucun scan encore. Sortez, portez, osez.",
];

export function getWaitingPhrase(memberId: string): string {
  const seed = memberId.charCodeAt(0) + new Date().getDate();
  return WAITING_PHRASES[seed % WAITING_PHRASES.length];
}
