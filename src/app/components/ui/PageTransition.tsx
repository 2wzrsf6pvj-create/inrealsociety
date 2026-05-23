'use client';

// Transition de page « wrapper manuel » : on keye le sous-arbre par pathname,
// donc à chaque navigation il se re-monte et rejoue un fondu d'entrée
// (animate-page-in). Couvre TOUTES les navigations (Link, router.push, retour
// navigateur) de façon uniforme, sans dépendance. Les changements de query
// (?tab=) ne changent pas le pathname → pas de re-montage (les onglets gardent
// leur propre animation).

import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
