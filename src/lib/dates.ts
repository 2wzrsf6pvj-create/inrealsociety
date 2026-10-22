// Date en toutes lettres, heure de Paris (« 22 novembre 2026 ») : emails et
// réglages du premium. Utilisable côté serveur comme côté navigateur.
export function formatDayFr(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(new Date(date));
}
