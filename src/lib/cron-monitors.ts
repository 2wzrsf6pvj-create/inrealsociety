// src/lib/cron-monitors.ts
// Surveillance Sentry Crons (choix de Clément) : alerte si une tâche ne passe
// pas à l'heure, ou échoue. Gratuite pour une seule tâche : celle qui rattrape
// les t-shirts payés non imprimés. Le moniteur est créé au premier passage.

export const FULFILLMENT_MONITOR = {
  slug: 'fulfillment-reconcile',
  config: {
    /** Horaire de vercel.json (vérifié par les tests). */
    schedule:      { type: 'crontab', value: '0 5 * * *' },
    /** Une heure : sur l'offre Hobby, Vercel lance la tâche n'importe quand
     *  dans l'heure prévue. */
    checkinMargin: 60,
    maxRuntime:    10,
    timezone:      'Etc/UTC',
  },
} as const;
