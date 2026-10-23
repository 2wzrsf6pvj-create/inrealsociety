'use client';

// Fenêtre modale native (<dialog> ouvert par showModal) : le focus y entre et y
// reste, Échap la ferme, le reste de la page devient inerte (lecteurs d'écran
// compris), et le focus revient à l'élément d'origine à la fermeture.
// Montée quand la fenêtre s'ouvre. Toute fermeture (Échap, bouton, clic sur le
// fond) passe par dialog.close() : onClose démonte ensuite. La fenêtre couvre
// l'écran, transparente : le contenu porte son propre fond.

import { useLayoutEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';

/** Ferme la fenêtre qui contient l'élément cliqué (bouton, fond…). */
export function closeDialog(event: SyntheticEvent<HTMLElement>) {
  event.currentTarget.closest('dialog')?.close();
}

export default function ModalDialog({ labelledBy, describedBy, onClose, children }: {
  /** id du titre de la fenêtre : son nom, annoncé à l'ouverture. */
  labelledBy:   string;
  /** id d'un texte lu après le titre à l'ouverture. */
  describedBy?: string;
  onClose:      () => void;
  children:     ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // Par défaut, le focus va au premier élément focalisable ; data-autofocus
    // désigne l'action principale (ex. « Suivant ») quand ce n'est pas elle.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={labelledBy} aria-describedby={describedBy} onClose={onClose}
      className="m-0 p-0 border-0 w-full h-full max-w-none max-h-none bg-transparent text-brand-white backdrop:bg-transparent">
      {children}
    </dialog>
  );
}
