/**
 * Échappe les caractères HTML dangereux dans une chaîne.
 * À utiliser sur toute variable utilisateur interpolée dans du HTML (emails, etc.)
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}