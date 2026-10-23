'use client';

// Hooks partagés entre les sections du dashboard.

import { useEffect, useState } from 'react';

/**
 * Compteur animé 0 → target, easing easeOutQuart, respecte prefers-reduced-motion.
 * Usage : `const display = useCountUp(member.scan_count);` puis afficher `{display}`.
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    // 0 ou mouvement réduit : la valeur finale tout de suite (à la frame suivante).
    const instant = target === 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
