import {
  PAREN_LEFT_PATH, PAREN_LEFT_BBOX, PAREN_RIGHT_PATH, PAREN_RIGHT_BBOX,
} from '@/lib/brand-mark.generated';

// Le mark de marque « ( • ) » (œil / parenthèses Cormorant + point), source UNIQUE pour
// tout le site. Géométrie identique à `renderEyeMark` (print) → web et tee cohérents.
// Rend un SVG inline qui hérite de la TAILLE (hauteur = 1em, pilotée par la font-size du
// parent) et de la COULEUR (`currentColor`). Remplace l'ancien monogramme )( partout.
const H = 100;
const s = H / (PAREN_LEFT_BBOX.y2 - PAREN_LEFT_BBOX.y1);
const lw = (PAREN_LEFT_BBOX.x2 - PAREN_LEFT_BBOX.x1) * s;
const rw = (PAREN_RIGHT_BBOX.x2 - PAREN_RIGHT_BBOX.x1) * s;
const GAP = 0.26 * H;                 // écart ( ↔ ) = ouverture de l'œil
const W = lw + GAP + rw;
const lTx = -PAREN_LEFT_BBOX.x1 * s;
const lTy = -PAREN_LEFT_BBOX.y1 * s;
const rTx = lw + GAP - PAREN_RIGHT_BBOX.x1 * s;
const rTy = -PAREN_RIGHT_BBOX.y1 * s;

/**
 * Le logo ( • ). `label` → rôle img + aria-label (usage signifiant, ex. lien accueil) ;
 * sans label → décoratif (aria-hidden). La taille suit la `font-size` du parent (1em),
 * la couleur suit `currentColor` → on garde les classes Tailwind existantes du span.
 */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W.toFixed(2)} ${H}`}
      className={className}
      fill="currentColor"
      style={{ height: '1.15em', width: 'auto', display: 'inline-block', verticalAlign: '-0.18em' }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g transform={`translate(${lTx.toFixed(2)} ${lTy.toFixed(2)}) scale(${s.toFixed(4)})`}>
        <path d={PAREN_LEFT_PATH} />
      </g>
      <g transform={`translate(${rTx.toFixed(2)} ${rTy.toFixed(2)}) scale(${s.toFixed(4)})`}>
        <path d={PAREN_RIGHT_PATH} />
      </g>
      <circle cx={(W / 2).toFixed(2)} cy={H / 2} r={(0.07 * H).toFixed(2)} />
    </svg>
  );
}
