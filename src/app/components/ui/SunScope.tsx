'use client';

// Borne le mode plein soleil au PARCOURS SCANNEUR (profil / message /
// conversation). La préférence est globale (localStorage irs_sun) mais le thème
// clair n'est appliqué que sur ces routes — les autres pages (dashboard, shop,
// landing) ne sont pas conçues pour le fond clair et restent en sombre. À chaque
// navigation, on (ré)applique ou retire la classe `sun` selon route + préférence.

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const SCANNER_ROUTE = /^\/(profil|message|conversation)(\/|$)/;

export default function SunScope() {
  const pathname = usePathname();
  useEffect(() => {
    let pref = false;
    try { pref = localStorage.getItem('irs_sun') === '1'; } catch { /* stockage indispo */ }
    document.documentElement.classList.toggle('sun', pref && SCANNER_ROUTE.test(pathname));
  }, [pathname]);
  return null;
}
