import Link from 'next/link';
import { MANIFESTO_BLOCKS } from '../constants/manifesto';
import AnimatedBlock from '../components/ui/AnimatedBlock';
// --- TYPAGE STRICT ---
type ManifestoBlock = {
  label: string | null;
  title: string;
  body: string;
  highlight?: boolean;
};

// --- RÉFÉRENCEMENT (SEO) & PARTAGE ---
export const metadata = {
  title: 'In Real Society | Le vêtement de rencontre IRL',
  description: 'Zéro algorithme. Une seule promesse : chaque scan que vous recevrez sera une véritable intersection du destin.',
  openGraph: {
    title: 'In Real Society',
    description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie.',
    url: 'https://inrealsociety.com',
    siteName: 'In Real Society',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'fr_FR',
    type: 'website',
  },
};

export default function ManifestePage() {
  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white overflow-hidden">

      {/* Background Gradient */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)' }} />

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center gap-8">
        <div className="flex flex-col items-center gap-6 max-w-sm">
          <div className="relative">
            <div className="absolute w-20 h-20 rounded-full border border-brand-white/10 animate-ring-pulse" />
            <div className="w-16 h-16 rounded-full border border-brand-white/50 flex items-center justify-center">
              <span className="font-display text-2xl md:text-3xl font-light">)(</span>
            </div>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-light leading-[1.15] tracking-[0.02em]">
            In Real<br />Society.
          </h1>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/60 leading-relaxed tracking-wide">
            Le premier vêtement conçu pour<br />les rencontres dans la vraie vie.
          </p>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          <a href="#manifeste" className="font-ui text-sm text-brand-gray/40 tracking-[0.2em] uppercase hover:text-brand-white transition-colors">
            Lire le manifeste ↓
          </a>
        </div>
      </section>

      {/* Sommaire cliquable */}
      <nav className="relative z-10 max-w-lg mx-auto px-6 pb-16">
        <div className="border border-brand-gray/10 rounded-[2px] p-5 md:p-6 bg-[#080808]">
          <p className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase mb-4">Sommaire</p>
          <div className="flex flex-col gap-2">
            {MANIFESTO_BLOCKS.map((block: ManifestoBlock, i: number) => (
              <a
                key={i}
                href={`#section-${i}`}
                className="flex items-center gap-3 group py-1"
              >
                <span className="font-ui text-xxs text-brand-gray/20 tabular-nums w-5">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-ui text-sm text-brand-gray/50 group-hover:text-brand-white transition-colors">
                  {block.title}
                </span>
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Manifeste */}
      <section id="manifeste" className="relative z-10 max-w-lg mx-auto px-6 pb-24 flex flex-col gap-16 md:gap-20">
        {MANIFESTO_BLOCKS.map((block: ManifestoBlock, i: number) => (
          <AnimatedBlock
            key={i}
            classNameInView="opacity-100 translate-y-0"
            classNameNotInView="opacity-0 translate-y-6"
          >
            <div id={`section-${i}`} className="flex flex-col gap-4 scroll-mt-8">
              {block.label && (
                <span className="font-ui text-xs text-brand-gray/30 tracking-[0.25em] uppercase">
                  {block.label}
                </span>
              )}

              {block.highlight ? (
                <div className="border border-brand-white/10 rounded-[2px] p-5 md:p-6 flex flex-col gap-4 bg-[#080808]">
                  <h2 className="font-display text-xl md:text-2xl font-light leading-[1.2] tracking-[0.02em]">
                    {block.title}
                  </h2>
                  <div className="w-full h-px bg-brand-gray/10" />
                  {block.body.split('\n\n').map((p: string, j: number) => (
                    <p key={j} className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                <>
                  <h2 className="font-display text-2xl md:text-3xl font-light leading-[1.2] tracking-[0.02em]">
                    {block.title}
                  </h2>
                  {block.body.split('\n\n').map((p: string, j: number) => (
                    <p key={j} className="font-ui text-sm md:text-base font-light text-brand-gray/60 leading-relaxed">
                      {p}
                    </p>
                  ))}
                </>
              )}
            </div>
          </AnimatedBlock>
        ))}

        {/* CTA final */}
        <AnimatedBlock
          classNameInView="opacity-100 translate-y-0"
          classNameNotInView="opacity-0 translate-y-6"
        >
          <div className="flex flex-col items-center gap-6 pt-8 text-center">
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
            <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/60">
              &quot;Derrière chaque scan, il y a quelqu&apos;un<br />qui vous a vraiment regardé.&quot;
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
              <Link
                href="/register"
                className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-200 active:scale-[0.98] transition-all duration-200 block text-center"
              >
                Rejoindre le club
              </Link>
              <Link
                href="/cgv"
                className="font-ui text-xs text-brand-gray/25 tracking-[0.1em] text-center hover:text-brand-gray/50 transition-colors"
              >
                Conditions Générales de Vente
              </Link>
              <Link
                href="/"
                className="font-ui text-xs text-brand-gray/20 tracking-[0.1em] underline underline-offset-4 hover:text-brand-gray/50 transition-colors text-center"
              >
                &larr; retour &agrave; l&apos;accueil
              </Link>
            </div>
          </div>
        </AnimatedBlock>
      </section>
    </main>
  );
}
