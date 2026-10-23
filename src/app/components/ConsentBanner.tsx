'use client';

// Cookie consent banner — conforme CNIL (boutons Accepter/Refuser d'égal
// visuel, refus aussi facile que l'acceptation, lien vers la politique de
// confidentialité). Tant que l'utilisateur n'a pas accepté, PostHog n'est même
// pas téléchargé (cf. lib/posthog-client) : « Accepter » le charge.
//
// localStorage key: irs_consent = 'granted' | 'denied'
//
// Rendu côté serveur, donc affiché dès le premier rendu, sans attendre le
// JavaScript. Pour qui a déjà choisi, le script du <head> (layout) pose
// html.consent-set avant l'affichage, et globals.css masque le bandeau.
// Avant, il n'apparaissait qu'après l'hydratation : c'était l'élément LCP de
// l'accueil et de la FAQ, retardé d'autant que le JavaScript à exécuter.

import { useState } from 'react';
import Link from 'next/link';
import { CONSENT_KEY, disableAnalytics, loadAnalytics } from '@/lib/posthog-client';

export default function ConsentBanner() {
  const [dismissed, setDismissed] = useState(false);

  // Le chargement de PostHog pour un visiteur ayant déjà accepté est fait par
  // PostHogProvider ; ici, seulement le choix.
  const choose = (value: 'granted' | 'denied') => {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* stockage refusé : choix pour cette page */ }
    document.documentElement.classList.add('consent-set');
    if (value === 'granted') void loadAnalytics();
    else disableAnalytics();
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div data-consent-banner className="fixed bottom-0 left-0 right-0 z-[100] p-4 bg-brand-black/95 border-t border-brand-white/10 backdrop-blur-sm">
      <div className="max-w-2xl mx-auto flex flex-col md:flex-row md:items-center gap-3">
        <p className="font-ui text-xs md:text-sm text-brand-gray/60 leading-relaxed flex-1">
          Nous utilisons des cookies de mesure d&apos;audience pour comprendre comment vous utilisez le site.
          {' '}
          <Link href="/confidentialite" className="underline underline-offset-4 hover:text-brand-white transition-colors">
            En savoir plus
          </Link>
        </p>
        <div className="flex gap-2">
          <button onClick={() => choose('denied')}
            className="flex-1 md:flex-initial px-5 py-2.5 border border-brand-gray/25 hover:border-brand-gray/50 font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/60 hover:text-brand-white rounded-[2px] transition-colors"
            style={{ minHeight: '40px' }}>
            Refuser
          </button>
          <button onClick={() => choose('granted')}
            className="flex-1 md:flex-initial px-5 py-2.5 bg-brand-white text-brand-black font-ui font-bold text-xs tracking-[0.15em] uppercase rounded-[2px] hover:bg-gray-100 transition-colors"
            style={{ minHeight: '40px' }}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
