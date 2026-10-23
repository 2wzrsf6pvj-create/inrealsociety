import type { Metadata } from 'next';
import { BrandMark } from '@/app/components/ui/BrandMark';

// PAGE DÉMO (à screenshoter pour le hero « message reçu »). Reproduit fidèlement l'écran
// qu'un porteur voit quand un inconnu lui écrit : même chrome, même bulle (Cormorant
// italique + horodatage) que /conversation/[messageId]. Aucune donnée réelle — c'est un
// visuel. À supprimer quand le screen est pris. noindex.
export const metadata: Metadata = { title: 'Aperçu — message reçu', robots: { index: false, follow: false } };

export default function DemoMessagePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      {/* halos discrets, comme l'accueil */}
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-12%] right-[-12%] w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* signature */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl text-brand-white/70 leading-none"><BrandMark /></span>
          <span className="font-ui text-[0.7rem] text-brand-gray/55 tracking-[0.35em] uppercase">In Real Society</span>
        </div>

        {/* contexte : quelqu'un vous a remarqué */}
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-ui text-xs text-brand-gray/50 tracking-[0.3em] uppercase">Un inconnu vous a remarqué·e</p>
          <div className="flex items-center gap-3">
            <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.2em] uppercase">Anonyme</span>
            <span aria-hidden="true" className="text-brand-gray/15">·</span>
            <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.2em] uppercase">Éphémère</span>
            <span aria-hidden="true" className="text-brand-gray/15">·</span>
            <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.2em] uppercase">Une fois</span>
          </div>
        </div>

        {/* bulle message — style identique à /conversation (Cormorant italique) */}
        <div className="w-full flex flex-col self-start">
          <div className="max-w-[92%] self-start animate-slide-right">
            <div className="p-5 border bg-brand-white/5 border-brand-gray/15 rounded-[2px] rounded-tl-none">
              <p className="font-display text-lg md:text-xl font-light italic leading-relaxed text-brand-white/90">
                Tu étais devant moi à ce concert. Je n&apos;ai pas osé te parler.
                Alors j&apos;ai scanné, et voilà mon seul message : tu m&apos;as marqué·e.
              </p>
            </div>
            <p className="font-ui text-xxs text-brand-gray/50 mt-2">il y a 2 minutes</p>
          </div>
        </div>

        <p className="font-ui text-xs font-light text-brand-gray/55 text-center leading-relaxed">
          Un seul message. Vous pouvez répondre — ou le laisser filer.
        </p>
      </div>
    </main>
  );
}
