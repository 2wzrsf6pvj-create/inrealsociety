'use client';

// Bascule « plein soleil » (mode clair haute lisibilité) pour la lecture en
// extérieur. Placé sur le parcours scanneur (profil / message / conversation),
// le moment où l'on lit dehors. Persisté (localStorage irs_sun) ; le script
// anti-FOUC du layout applique la classe au boot. Bouton fixe en haut à gauche
// (l'AuthIndicator occupe le coin droit).

import { useEffect, useState } from 'react';

export default function SunToggle() {
  const [sun, setSun] = useState(false);

  useEffect(() => {
    setSun(document.documentElement.classList.contains('sun'));
  }, []);

  const toggle = () => {
    const next = !sun;
    setSun(next);
    document.documentElement.classList.toggle('sun', next);
    try { localStorage.setItem('irs_sun', next ? '1' : '0'); } catch { /* stockage indispo */ }
  };

  return (
    <button
      onClick={toggle}
      aria-label={sun ? 'Revenir au mode sombre' : 'Mode plein soleil (haute lisibilité)'}
      aria-pressed={sun}
      title={sun ? 'Mode sombre' : 'Plein soleil'}
      className="fixed top-4 left-4 z-50 w-11 h-11 rounded-full border border-brand-gray/25 bg-brand-black/60 backdrop-blur-sm flex items-center justify-center text-brand-white/70 hover:text-brand-white hover:border-brand-gray/50 transition-colors"
    >
      <span aria-hidden className="text-base leading-none">{sun ? '☾' : '☀'}</span>
    </button>
  );
}
