'use client';

// Brouillon gardé le temps de l'onglet (sessionStorage). Recharger la page,
// réflexe courant quand le réseau flanche, ne fait plus perdre le texte tapé.
// Rien ne part au serveur ; effacé à l'envoi (`clear`) ou à la fermeture de
// l'onglet.

import { useCallback, useEffect, useState } from 'react';

export function useDraft(key: string): [string, (value: string) => void, () => void] {
  const [value, setValue] = useState('');

  // Lu après l'hydratation (le rendu serveur n'a pas accès au stockage).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage, lu après l'hydratation
      if (saved) setValue(saved);
    } catch { /* stockage indisponible : pas de brouillon */ }
  }, [key]);

  const update = useCallback((next: string) => {
    setValue(next);
    try {
      if (next) sessionStorage.setItem(key, next);
      else sessionStorage.removeItem(key);
    } catch { /* stockage indisponible ou plein : le champ marche sans */ }
  }, [key]);

  const clear = useCallback(() => update(''), [update]);

  return [value, update, clear];
}
