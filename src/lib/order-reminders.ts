// src/lib/order-reminders.ts
// Relance des acheteurs qui ont PAYÉ mais n'ont jamais activé leur profil.
// Depuis l'impression au paiement, leur t-shirt part quand même : sans profil,
// chaque scan tombe sur « pas encore activé » — les premiers scans sont perdus.
// Règle pure (testable sans base) ; l'envoi vit dans /api/cron/activation-reminder.

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1re relance : J+2 après la commande (le temps d'activer seul). */
export const FIRST_REMINDER_AFTER_DAYS  = 2;
/** 2e relance : J+7 (le tee arrive), au moins 3 jours après la première. */
export const SECOND_REMINDER_AFTER_DAYS = 7;
export const MIN_DAYS_BETWEEN_REMINDERS = 3;
/** Au-delà, on arrête : pas de relance sur une commande ancienne. */
export const REMINDER_WINDOW_DAYS       = 30;
export const MAX_ORDER_REMINDERS        = 2;

export interface OrderReminderState {
  created_at:                string;
  activation_reminders_sent: number;
  activation_reminder_at:    string | null;
}

/** Cette commande (payée, code non utilisé) doit-elle recevoir une relance maintenant ? */
export function isOrderReminderDue(order: OrderReminderState, now: number = Date.now()): boolean {
  const age = now - Date.parse(order.created_at);
  if (age > REMINDER_WINDOW_DAYS * DAY_MS) return false;

  if (order.activation_reminders_sent <= 0) {
    return age >= FIRST_REMINDER_AFTER_DAYS * DAY_MS;
  }
  if (order.activation_reminders_sent === 1) {
    const sinceLast = order.activation_reminder_at
      ? now - Date.parse(order.activation_reminder_at)
      : Infinity;
    return age >= SECOND_REMINDER_AFTER_DAYS * DAY_MS
        && sinceLast >= MIN_DAYS_BETWEEN_REMINDERS * DAY_MS;
  }
  return false;
}
