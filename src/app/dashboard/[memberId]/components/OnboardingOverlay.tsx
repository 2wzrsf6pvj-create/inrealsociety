'use client';

// Onboarding première ouverture — porteur uniquement (monté dans le dashboard,
// qui exige l'auth). Affiché UNE fois (flag localStorage), puis laisse place au
// guide d'activation in-dashboard (scan_count===0). Le scanneur ne le voit jamais.
// Fenêtre modale : le focus ne passe pas derrière, Échap équivaut à « Passer ».

import React, { useEffect, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { BrandMark } from '@/app/components/ui/BrandMark';
import ModalDialog, { closeDialog } from '@/app/components/ui/ModalDialog';

const KEY = 'irs_onboarding_v1';

const SCREENS = [
  {
    logo: true,
    title: 'Bienvenue.',
    body: 'In Real Society — le club social de la vraie vie. Pas d’algorithme, pas de swipe. Un t-shirt, un QR, une rencontre.',
  },
  {
    title: 'Portez. Faites-vous remarquer.',
    body: 'Quand quelqu’un vous remarque dans la vraie vie, il scanne le QR de votre t-shirt et vous envoie un signal.',
  },
  {
    title: 'Vous gardez le contrôle.',
    body: 'Fenêtre limitée, conversations éphémères, blocage en un tap. Vous décidez qui peut vous parler.',
  },
];

export default function OnboardingOverlay({ name }: { name?: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI]       = useState(0);

  // Lu en effet (pas au render) → pas de mismatch d'hydratation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage, lu après l'hydratation
    try { if (!localStorage.getItem(KEY)) setOpen(true); } catch { /* no-op */ }
  }, []);

  if (!open) return null;

  const last = i === SCREENS.length - 1;
  // Toute fermeture (Passer, Commencer, Échap) : présentation vue.
  const finish = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* no-op */ }
    haptic('success');
    setOpen(false);
  };

  const s = SCREENS[i];

  return (
    <ModalDialog labelledBy="onboarding-title" describedBy="onboarding-body" onClose={finish}>
      <div className="h-full bg-brand-black flex flex-col items-center justify-between px-8 py-12 animate-fade-in">
        <div className="w-full flex justify-end">
          <button onClick={closeDialog}
            className="font-ui text-xxs text-brand-gray/55 tracking-[0.2em] uppercase py-2 hover:text-brand-white/80 transition-colors"
            style={{ minHeight: '44px' }}>
            Passer
          </button>
        </div>

        {/* Annoncé à chaque écran (lecteurs d'écran) ; key={i} → ré-anime l'entrée */}
        <div aria-live="polite">
          <div key={i} className="flex flex-col items-center text-center gap-6 max-w-xs animate-stagger-1">
            {s.logo && (
              <div className="w-20 h-20 rounded-full border border-brand-white/20 flex items-center justify-center mb-2">
                <span className="font-display text-4xl font-light"><BrandMark /></span>
              </div>
            )}
            <h2 id="onboarding-title" className="font-display text-3xl font-light tracking-[0.04em] leading-snug">
              {i === 0 && name ? <>Bienvenue,<br /><span className="italic">{name}</span>.</> : s.title}
            </h2>
            <p id="onboarding-body" className="font-ui text-sm font-light text-brand-gray/70 leading-relaxed">{s.body}</p>
            <p className="sr-only">Écran {i + 1} sur {SCREENS.length}</p>
          </div>
        </div>

        <div className="w-full flex flex-col items-center gap-6">
          <div className="flex gap-2" aria-hidden="true">
            {SCREENS.map((_, idx) => (
              <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx === i ? 'w-6 bg-brand-white/70' : 'w-1.5 bg-brand-gray/25'}`} />
            ))}
          </div>
          {/* Action principale : le focus y va à l'ouverture (Entrée continue). */}
          <button data-autofocus onClick={e => { if (last) { closeDialog(e); return; } haptic('light'); setI(i + 1); }}
            className="animate-shimmer w-full max-w-xs py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] active:scale-[0.98] transition-all duration-200"
            style={{ minHeight: '44px' }}>
            {last ? 'Commencer' : 'Suivant'}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
