// Mockup « écran verrouillé + notification IRS » — le visuel « moment de réception ».
// Source de vérité unique : réutilisé par l'accueil (hero) ET la page démo.
// Tout est dimensionné en `cqw` (1 % de la largeur du châssis) → le téléphone scale
// PARFAITEMENT à n'importe quelle largeur que le parent lui donne (mobile ~200px,
// desktop ~250px), sans casser les proportions. Client-safe (aucune dépendance serveur).

import { BrandMark } from '@/app/components/ui/BrandMark';

export function PhoneNotif({
  className = '',
  time = '22:47',
  date = 'Vendredi 17 juillet',
  title = 'Un regard s’est posé sur vous',
  body = 'Tu étais devant moi à ce concert. Je n’ai pas osé te parler…',
  animate = false,
}: {
  className?: string;
  time?: string;
  date?: string;
  title?: string;
  body?: string;
  // `animate` : la notif « tombe » sur l'écran après ~0,9 s (hero accueil). Off par
  // défaut → la page démo reste figée pour le screenshot.
  animate?: boolean;
}) {
  return (
    // châssis — `container-type:inline-size` : toutes les unités cqw enfants sont
    // relatives à CETTE largeur.
    <div
      role="img"
      aria-label="Notification In Real Society sur un écran verrouillé&nbsp;: un regard s’est posé sur vous"
      className={`[container-type:inline-size] rounded-[14.6cqw] border border-white/10 bg-[#0a0a0c] p-[2.7cqw] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] ${className}`}
    >
      {/* écran */}
      <div className="relative rounded-[12.5cqw] overflow-hidden aspect-[9/19.5]
                      bg-[radial-gradient(120%_80%_at_50%_-10%,#26262c_0%,#0d0d10_55%,#050506_100%)]">
        {/* encoche */}
        <div className="absolute top-[2.7cqw] left-1/2 -translate-x-1/2 w-[32cqw] h-[8cqw] rounded-full bg-black/80 z-20" />

        {/* heure + date */}
        <div className="pt-[21cqw] flex flex-col items-center text-white">
          <span className="font-ui text-[3.3cqw] tracking-[0.3em] text-white/40 uppercase mb-[2.7cqw]">{date}</span>
          <span className="font-display text-[24cqw] font-light leading-none tracking-tight tabular-nums">{time}</span>
        </div>

        {/* ── LA notification ── */}
        <div className={`absolute left-[4cqw] right-[4cqw] top-[38%] ${animate ? 'animate-notif-drop' : ''}`}>
          <div className="rounded-[5.3cqw] bg-white/[0.13] backdrop-blur-xl border border-white/10 p-[4.7cqw] shadow-lg">
            <div className="flex items-center gap-[3.3cqw] mb-[2.7cqw]">
              {/* icône app */}
              <span className="flex items-center justify-center w-[10.7cqw] h-[10.7cqw] rounded-[2.9cqw] bg-brand-black border border-white/15 text-white text-[6cqw] leading-none shrink-0">
                <BrandMark />
              </span>
              <span className="font-ui text-[3.3cqw] tracking-[0.22em] uppercase text-white/70 flex-1">In Real Society</span>
              <span className="font-ui text-[3.2cqw] text-white/45">maintenant</span>
            </div>
            <p className="font-ui text-[4.4cqw] font-medium text-white leading-snug">{title}</p>
            <p className="font-ui text-[4.3cqw] text-white/70 leading-snug mt-[0.8cqw]">{body}</p>
          </div>
        </div>

        {/* barre du bas + poignée */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-[5.3cqw] pb-[4cqw]">
          <span className="text-white/40 font-ui text-[3.2cqw] tracking-[0.15em] uppercase">Glissez pour ouvrir</span>
          <div className="w-[37cqw] h-[1.3cqw] rounded-full bg-white/30" />
        </div>
      </div>
    </div>
  );
}
