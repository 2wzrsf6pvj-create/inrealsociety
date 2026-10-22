// PostHog côté browser. N'est TÉLÉCHARGÉ qu'après consentement (irs_consent =
// 'granted') : ~60 ko de moins sur chaque page pour qui n'a pas encore choisi ou
// refuse — avant, il était chargé partout pour ne rien faire (opt-out par défaut).
// Tant qu'il n'est pas chargé, les helpers ne font rien (comme avant l'init).
// Helpers typés pour garder cohérence avec analytics-events.ts.

'use client';

import type { PostHog } from 'posthog-js';
import type { AnalyticsEvent, AnalyticsProperties } from './analytics-events';

const POSTHOG_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export const CONSENT_KEY = 'irs_consent';

let instance: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
const readyListeners = new Set<() => void>();

export function hasAnalyticsConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === 'granted'; } catch { return false; }
}

/** Charge et initialise PostHog, seulement si le visiteur a accepté. */
export function loadAnalytics(): Promise<PostHog | null> {
  if (typeof window === 'undefined' || !POSTHOG_KEY || !hasAnalyticsConsent()) return Promise.resolve(null);
  if (instance) return Promise.resolve(instance);
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!posthog.__loaded) {
        posthog.init(POSTHOG_KEY, {
          api_host:           POSTHOG_HOST,
          person_profiles:    'identified_only',
          capture_pageview:   false,
          capture_pageleave:  true,
          autocapture:        true,
          disable_session_recording: true,
          // Défauts prudents conservés : rien n'est envoyé ni stocké tant que
          // l'opt-in n'est pas posé (juste en dessous, le consentement étant
          // acquis). Pas de remote-config/flags (on n'en utilise pas).
          opt_out_capturing_by_default:    true,
          opt_out_persistence_by_default:  true,
          advanced_disable_flags:          true,
        });
      }
      posthog.opt_in_capturing();
      instance = posthog;
      readyListeners.forEach((cb) => cb());
      return posthog;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

/** Prévient quand PostHog est prêt (tout de suite s'il l'est déjà). */
export function onAnalyticsReady(cb: () => void): () => void {
  if (instance) cb();
  readyListeners.add(cb);
  return () => { readyListeners.delete(cb); };
}

/** Retrait du consentement : PostHog coupé (et sa persistance effacée). */
export function disableAnalytics(): void {
  instance?.opt_out_capturing();
}

export function captureEvent(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!instance?.__loaded) return;
  instance.capture(event, properties);
}

export function capturePageview(url: string): void {
  if (!instance?.__loaded) return;
  instance.capture('$pageview', { $current_url: url });
}

export function identifyMember(memberId: string, traits: AnalyticsProperties): void {
  if (!instance?.__loaded) return;
  instance.identify(memberId, traits);
}

export function resetIdentity(): void {
  if (!instance?.__loaded) return;
  instance.reset();
}
