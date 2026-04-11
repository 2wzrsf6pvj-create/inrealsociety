'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINES = [
  "Bienvenue dans la vraie vie.",
  "Ici, pas d'algorithme.",
  "Pas de swipes infinis.",
  "Vous n'aurez pas 50 notifications par jour,",
  "et c'est exactement le but.",
  "Chaque scan que vous recevrez",
  "sera une véritable intersection du destin.",
  "Portez-le et vivez.",
];

export default function OnboardingPage() {
  const router  = useRouter();
  const [step,    setStep]    = useState(0);
  const [fading,  setFading]  = useState(false);
  const [signed,  setSigned]  = useState(false);

  useEffect(() => {
    if (step >= LINES.length) return;
    const t = setTimeout(() => setStep(s => s + 1), step === 0 ? 600 : 900);
    return () => clearTimeout(t);
  }, [step]);

  const handleSign = () => {
    setSigned(true);
    setFading(true);
    setTimeout(() => router.push('/register'), 1200);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-8 overflow-hidden">

      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.04) 0%, transparent 65%)' }} />

      <div className={`z-10 flex flex-col items-center w-full max-w-sm gap-12 transition-opacity duration-700 ${fading ? 'opacity-0' : 'opacity-100'}`}>

        <div className="flex flex-col gap-3 text-center">
          {LINES.map((line, i) => (
            <p
              key={i}
              className={`
                font-display font-light leading-relaxed tracking-[0.03em]
                transition-all duration-700
                ${i < step ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
                ${i === 0 ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl text-brand-gray/80'}
                ${i === LINES.length - 1 ? 'text-brand-white text-xl md:text-2xl mt-4' : ''}
              `}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              {line}
            </p>
          ))}
        </div>

        <div className={`flex flex-col items-center gap-4 transition-all duration-700 ${step >= LINES.length ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

          <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />

          <button
            onClick={handleSign}
            disabled={signed}
            className="animate-shimmer w-full py-4 px-10 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
          >
            {signed ? 'Engagement pris.' : 'Je m\'engage'}
          </button>

          <p className="font-ui text-xs text-brand-gray/30 tracking-[0.15em] uppercase text-center">
            En continuant, vous acceptez d&apos;exister vraiment.
          </p>
        </div>

      </div>
    </main>
  );
}
