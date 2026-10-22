// Validateurs partagés — évite la duplication de regex entre routes.

/** Validation email basique (présence @ + domaine + TLD). */
export function isValidEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

// Constructeur plutôt que littéral : la cible TS (es5) refuse le drapeau `u` dans
// un littéral, mais tous les navigateurs visés le gèrent (\p{L} = toute lettre).
const FIRST_NAME_RE = new RegExp("^\\p{L}[\\p{L}\\p{M} '’-]{0,29}$", 'u');

/** Prénom saisi par un passant (scan, message) : lettres (accents compris),
 *  espaces, apostrophes et tirets, 30 caractères max, commence par une lettre.
 *  Le champ est affiché au porteur (email, tableau de bord) : ni chiffres, ni
 *  liens, ni phrases. Vérifié côté serveur, le client pouvant être contourné. */
export function isValidFirstName(str: string): boolean {
  return FIRST_NAME_RE.test(str);
}

/** Détecte si une chaîne ressemble à un handle Instagram (@ requis pour
 *  distinguer d'un email/texte libre). Utilisé pour classifier le contact
 *  laissé par un scanner. */
export function isInstagramHandle(str: string): boolean {
  return /^@[a-zA-Z0-9._]{1,30}$/.test(str);
}
