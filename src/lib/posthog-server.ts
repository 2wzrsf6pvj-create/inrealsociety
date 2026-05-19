// Helper PostHog côté serveur — pour events qui ne peuvent être émis que server-side
// (webhooks Stripe, etc.). Fire-and-forget : ne bloque jamais la réponse.
//
// Pattern serverless : nouveau client par appel + shutdown pour flush. Posthog-node
// préconise cette approche dans les environnements éphémères type Vercel/Lambda
// où le process peut être tué avant le flush automatique.

import { PostHog } from 'posthog-node';
import type { AnalyticsEvent, AnalyticsProperties } from './analytics-events';

interface CaptureParams {
  distinctId: string;
  event:      AnalyticsEvent;
  properties?: AnalyticsProperties;
}

export async function captureServerEvent({ distinctId, event, properties }: CaptureParams): Promise<void> {
  const key  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
  if (!key) return;

  const client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });

  try {
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch (err) {
    console.warn('[posthog-server] capture failed:', err);
  }
}
