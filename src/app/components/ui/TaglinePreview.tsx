'use client';

import { useMemo } from 'react';
import { composeBackPrintSVG } from '@/lib/generate-qr-svg';

// Aperçu LIVE de l'imprimé du dos (QR + accroche choisie), dans un cadre monochrome aux
// couleurs du tee : tee noir → encre blanche sur fond sombre ; tee blanc → encre noire sur
// fond clair. Pas de silhouette (illisible en clair-sur-clair) : on montre le PRINT tel qu'il
// sera imprimé. Le QR est un DÉMO (le vrai est unique par acheteur, généré au fulfillment).
const DEMO_URL = 'https://inrealsociety.com/?src=tee';

export default function TaglinePreview({
  taglineId,
  tshirtColor,
}: {
  taglineId: string | null;
  tshirtColor: 'dark' | 'light';
}) {
  const isDark = tshirtColor === 'dark';

  // Print régénéré à la volée. On retire width/height de la balise <svg> → fluide (viewBox).
  const printSvg = useMemo(() => {
    const { svg } = composeBackPrintSVG(DEMO_URL, tshirtColor, { taglineId });
    return svg.replace(/(<svg[^>]*?) width="[^"]*" height="[^"]*"/, '$1');
  }, [taglineId, tshirtColor]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative w-full max-w-[240px] mx-auto aspect-[5/6] rounded-[3px] border flex items-center justify-center px-8 py-7 ${isDark ? 'border-brand-gray/15' : 'border-brand-gray/25'}`}
        style={{ background: isDark ? '#0b0b0b' : '#f4f2ee' }}
      >
        <div
          key={`${tshirtColor}-${taglineId ?? 'none'}`}
          className="w-[82%] animate-fade-in [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
          // SVG maison (accroche issue d'une bibliothèque fermée + URL constante) → sûr.
          dangerouslySetInnerHTML={{ __html: printSvg }}
        />
      </div>
      <span className={`font-ui text-[0.6rem] tracking-[0.18em] uppercase ${isDark ? 'text-brand-gray/45' : 'text-brand-gray/55'}`}>
        L&apos;imprimé du dos
      </span>
    </div>
  );
}
