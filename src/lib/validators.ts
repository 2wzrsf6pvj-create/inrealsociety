// Validateurs partagés — évite la duplication de regex entre routes.

/** Validation email basique (présence @ + domaine + TLD). */
export function isValidEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

/** Détecte si une chaîne ressemble à un handle Instagram (@ requis pour
 *  distinguer d'un email/texte libre). Utilisé pour classifier le contact
 *  laissé par un scanner. */
export function isInstagramHandle(str: string): boolean {
  return /^@[a-zA-Z0-9._]{1,30}$/.test(str);
}
