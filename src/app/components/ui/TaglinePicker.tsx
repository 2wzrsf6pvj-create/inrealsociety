'use client';

// Sélecteur d'ACCROCHE imprimée sous le QR, partagé boutique (achat) et activation
// (register). Le client choisit dans une bibliothèque FERMÉE (jamais de texte libre).
//
// Deux niveaux (26 accroches → un <select> était hors du langage visuel du shop, qui
// n'utilise que des grilles de boutons) : on choisit d'abord un REGISTRE, puis une
// accroche parmi ses puces. L'aperçu est fidèle au tee — texte clair sur fond sombre /
// sombre sur fond clair — soit exactement ce qui sera imprimé (monochrome, getInkColor).

import { useState } from 'react';
import {
  taglinesByRegistre, getTagline, TAGLINES,
  type TaglineRegistre,
} from '@/lib/taglines';

type TeeColor = 'dark' | 'light';

// Libellés COURTS pour les onglets (les longs de REGISTRE_LABELS débordent sur mobile).
const SHORT: Record<TaglineRegistre, string> = {
  'drague':         'Drague',
  'message-unique': 'Message',
  'jeu':            'Jeu',
  'mystere':        'Mystère',
  'amitie':         'Amitié',
};

export default function TaglinePicker({ value, onChange, tshirtColor }: {
  value: string | null;
  onChange: (id: string | null) => void;
  tshirtColor?: TeeColor;
}) {
  const groups = taglinesByRegistre();
  const current = getTagline(value);

  // Onglet ouvert : celui de l'accroche choisie, sinon le premier (drague).
  const [openReg, setOpenReg] = useState<TaglineRegistre>(current?.registre ?? 'drague');
  const openGroup = groups.find((g) => g.registre === openReg) ?? groups[0];

  // Aperçu fidèle au tee : encre blanche sur noir, noire sur blanc.
  const dark = tshirtColor !== 'light';
  const bg = dark ? '#0a0a0a' : '#ffffff';
  const ink = dark ? '#ffffff' : '#0a0a0a';

  const chip = (active: boolean) =>
    `rounded-[2px] border transition-all font-ui ${
      active
        ? 'border-brand-white/60 bg-brand-white/5 text-brand-white'
        : 'border-brand-gray/15 text-brand-gray/50 hover:border-brand-gray/30'
    }`;

  return (
    <div className="flex flex-col gap-2">
      <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Accroche</p>
      <p className="font-ui text-xxs text-brand-gray/55 -mt-1">
        Imprimée sous le QR, dans le dos. Elle donne envie de scanner.
      </p>

      {/* Niveau 1 — registre (navigation pure) */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g.registre}
            type="button"
            onClick={() => setOpenReg(g.registre)}
            aria-pressed={openReg === g.registre}
            className={`${chip(openReg === g.registre)} px-3 py-2 text-xs tracking-[0.1em]`}
          >
            {SHORT[g.registre]}
          </button>
        ))}
      </div>

      {/* Niveau 2 — le choix : « QR seul » puis les accroches du registre ouvert */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`${chip(value === null)} px-3 py-2 text-sm`}
        >
          QR seul
        </button>
        {openGroup.items.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={value === t.id}
            className={`${chip(value === t.id)} px-3 py-2 text-sm text-left`}
          >
            {t.text}
          </button>
        ))}
      </div>

      {/* Aperçu « comme imprimé » (bordure pour le détacher du fond sombre du shop) */}
      <div
        className="flex items-center justify-center text-center rounded-[2px] px-4 py-4 min-h-[52px] border border-brand-gray/15"
        style={{ background: bg, color: ink }}
        aria-live="polite"
      >
        <span className="font-ui font-bold text-sm leading-tight">
          {current ? current.text : 'QR seul'}
        </span>
      </div>
    </div>
  );
}

export const TAGLINE_COUNT = TAGLINES.length;
