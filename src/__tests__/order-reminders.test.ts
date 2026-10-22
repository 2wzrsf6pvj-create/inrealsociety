// Règle de relance des acheteurs payés non activés : J+2, puis J+7 (≥ 3 j d'écart),
// 2 relances max, rien au-delà de 30 jours.

import { describe, it, expect } from 'vitest';
import { isOrderReminderDue } from '@/lib/order-reminders';

const NOW = Date.parse('2026-10-22T10:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const order = (createdDaysAgo: number, sent = 0, lastDaysAgo: number | null = null) => ({
  created_at: daysAgo(createdDaysAgo),
  activation_reminders_sent: sent,
  activation_reminder_at: lastDaysAgo === null ? null : daysAgo(lastDaysAgo),
});

describe('isOrderReminderDue', () => {
  it('pas de relance avant J+2', () => {
    expect(isOrderReminderDue(order(1.9), NOW)).toBe(false);
  });

  it('1re relance à partir de J+2', () => {
    expect(isOrderReminderDue(order(2), NOW)).toBe(true);
    expect(isOrderReminderDue(order(5), NOW)).toBe(true);
  });

  it('2e relance seulement à J+7 ET 3 jours après la première', () => {
    expect(isOrderReminderDue(order(6, 1, 4), NOW)).toBe(false);   // trop tôt (J+6)
    expect(isOrderReminderDue(order(8, 1, 2), NOW)).toBe(false);   // 1re trop récente
    expect(isOrderReminderDue(order(8, 1, 3), NOW)).toBe(true);
  });

  it('jamais plus de 2 relances', () => {
    expect(isOrderReminderDue(order(20, 2, 10), NOW)).toBe(false);
  });

  it('rien au-delà de 30 jours, même sans relance', () => {
    expect(isOrderReminderDue(order(31), NOW)).toBe(false);
  });
});
