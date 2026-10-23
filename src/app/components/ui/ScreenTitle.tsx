'use client';

// Titre principal d'un écran qui en remplace un autre sans changer de page
// (ex. « Signal envoyé. » après l'envoi) : il prend le focus à son apparition.
// Un lecteur d'écran l'annonce, et la lecture comme la tabulation reprennent de
// là, au lieu de repartir du haut de la page.

import { useEffect, useRef, type ReactNode } from 'react';

export default function ScreenTitle({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`focus-visible:outline-none ${className}`}>
      {children}
    </h1>
  );
}
