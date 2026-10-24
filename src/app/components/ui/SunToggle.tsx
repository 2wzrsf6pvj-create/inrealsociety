'use client';

// Bascule « plein soleil » (mode clair haute lisibilité) pour la lecture en
// extérieur. Placé sur le parcours scanneur (profil / message / conversation),
// le moment où l'on lit dehors. Persisté (localStorage irs_sun) ; le script
// anti-FOUC du layout applique la classe au boot. Bouton en haut à gauche, qui
// défile avec la page : fixé, il passait sur le contenu (l'AuthIndicator
// occupe le coin droit, ailleurs que sur le parcours scanneur).

import { useEffect, useRef, useState } from 'react';

export default function SunToggle() {
  const [sun, setSun] = useState(false);
  const themeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- classe posée avant l'affichage par le script du <head>
    setSun(document.documentElement.classList.contains('sun'));
  }, []);

  const toggle = () => {
    const next = !sun;
    setSun(next);
    const root = document.documentElement;
    // Fondu de couleurs le temps du switch (classe retirée juste après), pour ne
    // pas alourdir les hovers en permanence. On annule le timer précédent : un
    // double-tap rapide ne coupe pas le fondu en cours.
    root.classList.add('theme-transition');
    root.classList.toggle('sun', next);
    if (themeTimer.current) clearTimeout(themeTimer.current);
    themeTimer.current = setTimeout(() => root.classList.remove('theme-transition'), 320);
    try { localStorage.setItem('irs_sun', next ? '1' : '0'); } catch { /* stockage indispo */ }
  };

  return (
    <button
      onClick={toggle}
      aria-label={sun ? 'Revenir au mode sombre' : 'Mode plein soleil (haute lisibilité)'}
      aria-pressed={sun}
      title={sun ? 'Mode sombre' : 'Plein soleil'}
      className="absolute top-4 left-4 z-50 w-11 h-11 rounded-full border border-brand-gray/25 bg-brand-black/60 backdrop-blur-sm flex items-center justify-center text-brand-white/70 hover:text-brand-white hover:border-brand-gray/50 transition-colors"
    >
      <span aria-hidden className="text-base leading-none">{sun ? '☾' : '☀'}</span>
    </button>
  );
}
