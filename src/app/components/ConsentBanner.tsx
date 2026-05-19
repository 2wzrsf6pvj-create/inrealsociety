'use client';

// Cookie consent banner — conforme CNIL (boutons Accepter/Refuser d'égal
// visuel, refus aussi facile que l'acceptation, lien vers la politique de
// confidentialité). Tant que l'utilisateur n'a pas choisi, PostHog est en
// opt-out par défaut (configuré dans PostHogProvider).
//
// localStorage key: irs_consent = 'granted' | 'denied'

import { useEffect, useState } from 'react';
import Link from 'next/link';
import posthog from 'posthog-js';

const CONSENT_KEY = 'irs_consent';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === 'granted' && posthog.__loaded) {
      posthog.opt_in_capturing();
      return;
    }
    if (stored === 'denied') return;
    setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    if (posthog.__loaded) posthog.opt_in_capturing();
    setVisible(false);
  };

  const reject = () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    if (posthog.__loaded) posthog.opt_out_capturing();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 bg-brand-black/95 border-t border-brand-white/10 backdrop-blur-sm">
      <div className="max-w-2xl mx-auto flex flex-col md:flex-row md:items-center gap-3">
        <p className="font-ui text-xs md:text-sm text-brand-gray/60 leading-relaxed flex-1">
          Nous utilisons des cookies de mesure d&apos;audience pour comprendre comment vous utilisez le site.
          {' '}
          <Link href="/confidentialite" className="underline underline-offset-4 hover:text-brand-white transition-colors">
            En savoir plus
          </Link>
        </p>
        <div className="flex gap-2">
          <button onClick={reject}
            className="flex-1 md:flex-initial px-5 py-2.5 border border-brand-gray/25 hover:border-brand-gray/50 font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/60 hover:text-brand-white rounded-[2px] transition-colors"
            style={{ minHeight: '40px' }}>
            Refuser
          </button>
          <button onClick={accept}
            className="flex-1 md:flex-initial px-5 py-2.5 bg-brand-white text-brand-black font-ui font-bold text-xs tracking-[0.15em] uppercase rounded-[2px] hover:bg-gray-100 transition-colors"
            style={{ minHeight: '40px' }}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
