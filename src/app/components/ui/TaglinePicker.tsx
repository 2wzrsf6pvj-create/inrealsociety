'use client';

// Sélecteur d'ACCROCHE imprimée sous le QR, partagé boutique (achat) et activation
// (register). Le client choisit dans une bibliothèque FERMÉE (jamais de texte libre).
// L'aperçu est fidèle au tee : texte clair sur fond sombre / sombre sur fond clair —
// c'est exactement ce qui sera imprimé (monochrome, cf. getInkColor).

import { taglinesByRegistre, getTagline, TAGLINES } from '@/lib/taglines';

type TeeColor = 'dark' | 'light';
const NONE = '__none__';   // valeur <select> pour « QR seul » (option = null)

export default function TaglinePicker({ value, onChange, tshirtColor }: {
  value: string | null;
  onChange: (id: string | null) => void;
  tshirtColor?: TeeColor;
}) {
  const groups = taglinesByRegistre();
  const current = getTagline(value);

  // Aperçu fidèle au tee : encre blanche sur noir, noire sur blanc.
  const dark = tshirtColor !== 'light';
  const bg = dark ? '#0a0a0a' : '#ffffff';
  const ink = dark ? '#ffffff' : '#0a0a0a';

  return (
    <div className="flex flex-col gap-2">
      <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Accroche</p>
      <p className="font-ui text-xxs text-brand-gray/55 -mt-1">
        Imprimée sous le QR, dans le dos. Elle donne envie de scanner.
      </p>

      <select
        value={value ?? NONE}
        onChange={(e) => onChange(e.target.value === NONE ? null : e.target.value)}
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui text-sm py-2.5 px-3 rounded-[2px] outline-none transition-colors"
      >
        <option value={NONE} className="bg-brand-black">Aucune — QR seul</option>
        {groups.map((g) => (
          <optgroup key={g.registre} label={g.label} className="bg-brand-black">
            {g.items.map((t) => (
              <option key={t.id} value={t.id} className="bg-brand-black">{t.text}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Aperçu « comme imprimé » */}
      <div
        className="flex items-center justify-center text-center rounded-[2px] px-4 py-4 min-h-[52px]"
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
