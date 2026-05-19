'use client';

// Initialise posthog-js une seule fois côté client. Capture automatique des pageviews
// (incluant les changements de route App Router via le hook usePathname).

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const POSTHOG_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    if (posthog.__loaded) return;

    posthog.init(POSTHOG_KEY, {
      api_host:           POSTHOG_HOST,
      person_profiles:    'identified_only',
      capture_pageview:   false,
      capture_pageleave:  true,
      autocapture:        true,
      disable_session_recording: true,
      // RGPD : pas de capture tant que l'utilisateur n'a pas consenti.
      // Le ConsentBanner appelle posthog.opt_in_capturing() au clic 'Accepter'.
      opt_out_capturing_by_default: true,
    });
  }, []);

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    if (!posthog.__loaded) return;
    if (!pathname) return;

    const url = searchParams?.toString()
      ? `${window.location.origin}${pathname}?${searchParams.toString()}`
      : `${window.location.origin}${pathname}`;

    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
