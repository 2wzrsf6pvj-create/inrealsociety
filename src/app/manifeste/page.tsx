'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const MANIFESTO_BLOCKS = [
  {
    label: null,
    title: "Vous êtes fatigué.",
    body: "Fatigué des profils qui s'accumulent. Des matchs qui ne mènent nulle part. Du scroll infini qui remplace la vie réelle. Vous avez raison d'être fatigué.",
  },
  {
    label: "Le problème",
    title: "L'application a tué le hasard.",
    body: "Il y a dix ans, on se rencontrait dans la rue, dans un café, dans une salle de concert. Par accident. Par destin. Ces rencontres-là avaient une texture que l'écran ne peut pas reproduire.",
  },
  {
    label: "Notre réponse",
    title: "Un vêtement comme seule interface.",
    body: "In Real Society n'est pas une application de rencontres. C'est un vêtement. Un tissu. Quelque chose que vous portez sur vous quand vous sortez dans le monde réel.",
  },
  {
    label: "Comment ça marche",
    title: "Un QR code. Un profil. Une intersection.",
    body: "Quelqu'un vous remarque dans la rue. Il scanne le QR code imprimé sur votre dos. Il tombe sur votre prénom, votre pitch, votre humanité condensée en quelques mots. Et là, il lève la tête de son écran. Vous êtes en face de lui.",
  },
  {
    label: "Anti-Tinder",
    title: "Si vous cherchez la quantité, restez sur votre canapé.",
    body: "Si vous cherchez l'évidence, sortez dans la rue.\n\nNous ne proposons pas 50 matchs par jour. Nous proposons zéro algorithme et une seule promesse : chaque scan que vous recevrez sera une véritable intersection du destin. Pas un clic de confort. Une rencontre.",
    highlight: true,
  },
  {
    label: "Le pacte",
    title: "Portez-le et vivez.",
    body: "Ce n'est pas un gadget. C'est un engagement. Celui de sortir, de circuler, d'exister dans l'espace public avec l'intention d'être vu — pas sur un écran, mais dans la vraie vie.",
  },
];

export default function ManifestePage() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(v => Math.min(v + 1, MANIFESTO_BLOCKS.length));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white overflow-hidden">

      <div className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)' }} />

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center gap-8">
        <div className="flex flex-col items-center gap-6 max-w-sm">
          <div className="relative">
            <div className="absolute w-20 h-20 rounded-full border border-brand-white/10 animate-ring-pulse" />
            <div className="w-16 h-16 rounded-full border border-brand-white/50 flex items-center justify-center">
              <span className="font-display text-[1.6rem] font-light">X</span>
            </div>
          </div>
          <h1 className="font-display text-[2.4rem] font-light leading-[1.15] tracking-[0.02em]">
            In Real<br />Society.
          </h1>
          <p className="font-ui text-[0.68rem] font-light text-brand-gray/60 leading-relaxed tracking-wide">
            Le premier vêtement conçu pour<br />les rencontres dans la vraie vie.
          </p>
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          <a href="#manifeste" className="font-ui text-[0.58rem] text-brand-gray/40 tracking-[0.2em] uppercase hover:text-brand-white transition-colors">
            Lire le manifeste ↓
          </a>
        </div>
      </section>

      {/* Manifeste */}
      <section id="manifeste" className="relative z-10 max-w-lg mx-auto px-6 pb-24 flex flex-col gap-20">
        {MANIFESTO_BLOCKS.map((block, i) => (
          <div
            key={i}
            className={`flex flex-col gap-4 transition-all duration-700 ${i < visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          >
            {block.label && (
              <span className="font-ui text-[0.52rem] text-brand-gray/30 tracking-[0.25em] uppercase">
                {block.label}
              </span>
            )}

            {block.highlight ? (
              <div className="border border-brand-white/10 rounded-[2px] p-6 flex flex-col gap-4 bg-[#080808]">
                <h2 className="font-display text-[1.4rem] font-light leading-[1.2] tracking-[0.02em]">
                  {block.title}
                </h2>
                <div className="w-full h-px bg-brand-gray/10" />
                {block.body.split('\n\n').map((p, j) => (
                  <p key={j} className="font-ui text-[0.7rem] font-light text-brand-gray/70 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <>
                <h2 className="font-display text-[1.5rem] font-light leading-[1.2] tracking-[0.02em]">
                  {block.title}
                </h2>
                {block.body.split('\n\n').map((p, j) => (
                  <p key={j} className="font-ui text-[0.7rem] font-light text-brand-gray/60 leading-relaxed">
                    {p}
                  </p>
                ))}
              </>
            )}
          </div>
        ))}

        {/* CTA final */}
        <div className={`flex flex-col items-center gap-6 pt-8 text-center transition-all duration-700 ${MANIFESTO_BLOCKS.length <= visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          <p className="font-display text-[1.1rem] font-light italic text-brand-gray/60">
            "Chaque scan sera une véritable<br />intersection du destin."
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Link
              href="/register"
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
            >
              Rejoindre le club
            </Link>
            <Link
              href="/cgv"
              className="font-ui text-[0.52rem] text-brand-gray/25 tracking-[0.1em] text-center hover:text-brand-gray/50 transition-colors"
            >
              Conditions Générales de Vente
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}