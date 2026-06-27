// Retour haptique (vibration) sur les actions clés — donne un côté « app native ».
// No-op gracieux si : pas de navigator.vibrate (iOS Safari ne le supporte pas),
// SSR, ou l'utilisateur a demandé prefers-reduced-motion (accessibilité).
//
// ⚠️ À n'utiliser QUE sur des actions DIRECTES de l'utilisateur (tap), jamais sur
// un événement automatique — sinon le téléphone vibre « sans raison ».

type HapticKind = 'light' | 'success' | 'warning';

const PATTERNS: Record<HapticKind, number | number[]> = {
  light:   8,             // tap léger (envoi, copie, sélection)
  success: [10, 40, 20],  // confirmation positive (signal envoyé)
  warning: [30, 30, 30],  // action lourde / irréversible (blocage)
};

export function haptic(kind: HapticKind = 'light'): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  // Respecte le réglage d'accessibilité (cohérent avec le CSS prefers-reduced-motion).
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* no-op */ }
}
