'use client';

// Charge PostHog seulement si le visiteur a accepté la mesure d'audience (au
// chargement, ou au clic « Accepter » du ConsentBanner), puis capture les pages
// vues (y compris les changements de route App Router via usePathname).
// Sans consentement, posthog-js n'est même pas téléchargé (cf. lib/posthog-client).

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { capturePageview, loadAnalytics, onAnalyticsReady } from '@/lib/posthog-client';

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAnalyticsReady(() => setReady(true));
    void loadAnalytics();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!ready || !pathname) return;
    const url = searchParams?.toString()
      ? `${window.location.origin}${pathname}?${searchParams.toString()}`
      : `${window.location.origin}${pathname}`;
    capturePageview(url);
  }, [ready, pathname, searchParams]);

  return <>{children}</>;
}
