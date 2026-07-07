'use client';

// Sélecteur de FORME du QR, partagé entre la boutique (achat) et l'activation
// (register). Chaque option montre un aperçu miniature des modules au bon arrondi.
// Si `tshirtColor` est fourni, le swatch est FIDÈLE au tee (modules or/noir ou
// navy/blanc) ; sinon il hérite de currentColor (neutre).

import { QR_STYLES, QR_STYLE_LABELS, QR_STYLE_CORNER, QR_SWATCH_COLORS, type QrStyleKey } from '@/lib/constants';

type TeeColor = 'dark' | 'light';

/** Grille 2×2 de modules au rayon `corner`. Couleurs fidèles au tee si fourni. */
function QrStyleSwatch({ corner, tshirtColor }: { corner: number; tshirtColor?: TeeColor }) {
  const s = 12, gap = 3, r = corner * s, total = s * 2 + gap;
  const cells = [[0, 0], [s + gap, 0], [0, s + gap], [s + gap, s + gap]];
  const theme = tshirtColor ? QR_SWATCH_COLORS[tshirtColor] : null;
  const pad = 5;
  const box = total + pad * 2;
  return (
    <svg width="30" height="30" viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {theme && <rect x="0" y="0" width={box} height={box} rx="3" fill={theme.bg} />}
      {cells.map(([x, y], i) => (
        <rect key={i} x={x + pad} y={y + pad} width={s} height={s} rx={r} ry={r}
          fill={theme ? theme.module : 'currentColor'} />
      ))}
    </svg>
  );
}

export default function QrStylePicker({ value, onChange, tshirtColor }: {
  value: QrStyleKey;
  onChange: (s: QrStyleKey) => void;
  tshirtColor?: TeeColor;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Style du QR</p>
      <p className="font-ui text-xxs text-brand-gray/55 -mt-1">La forme des modules imprimés dans le dos.</p>
      <div className="flex gap-2">
        {QR_STYLES.map(style => (
          <button
            key={style}
            type="button"
            onClick={() => onChange(style)}
            aria-pressed={value === style}
            className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-[2px] border transition-all font-ui text-xs tracking-[0.1em] ${
              value === style
                ? 'border-brand-white/60 bg-brand-white/5 text-brand-white'
                : 'border-brand-gray/15 text-brand-gray/50 hover:border-brand-gray/30'
            }`}
          >
            <QrStyleSwatch corner={QR_STYLE_CORNER[style]} tshirtColor={tshirtColor} />
            {QR_STYLE_LABELS[style]}
          </button>
        ))}
      </div>
    </div>
  );
}
