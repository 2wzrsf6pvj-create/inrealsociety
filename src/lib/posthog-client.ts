// Singleton PostHog côté browser. Init paresseuse via le PostHogProvider.
// Helpers typés pour garder cohérence avec analytics-events.ts.

'use client';

import posthog from 'posthog-js';
import type { AnalyticsEvent, AnalyticsProperties } from './analytics-events';

export function captureEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;
  if (!posthog.__loaded) return;
  posthog.capture(event, properties);
}

export function identifyMember(memberId: string, traits: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;
  if (!posthog.__loaded) return;
  posthog.identify(memberId, traits);
}

export function resetIdentity(): void {
  if (typeof window === 'undefined') return;
  if (!posthog.__loaded) return;
  posthog.reset();
}
