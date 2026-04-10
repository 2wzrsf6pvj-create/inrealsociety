'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const [referrer, setReferrer] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    // Stocke le code de parrainage pour l'utiliser à l'achat
    localStorage.setItem('referral_code', code.toUpperCase());
    // Trouve le parrain
    supabase.from('members').select('name').eq('referral_code', code.toUpperCase()).single()
      .then(({ data }) => { if (data) setReferrer(data.name); });
  }, [code]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center text-center gap-8 w-full max-w-xs">

        <div className="relative flex items-center justify-center animate-float">
          <div className="absolute w-20 h-20 rounded-full border border-brand-white/10 animate-ring-pulse" />
          <div className="w-14 h-14 rounded-full border border-brand-white/30 flex items-center justify-center">
            <span className="font-display text-2xl font-light">X</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 animate-stagger-1">
          <p className="font-ui text-[0.5rem] text-brand-gray/30 tracking-[0.3em] uppercase">Invitation</p>
          <h1 className="font-display text-[2rem] font-light tracking-[0.04em] leading-tight">
            {referrer
              ? <>{referrer}<br /><span className="text-brand-gray/50 text-[1.4rem]">vous invite.</span></>
              : <>Vous avez été invité.</>
            }
          </h1>
          <p className="font-ui text-[0.55rem] font-light text-brand-gray/40 leading-relaxed">
            InRealSociety — le vêtement qui dit oui.<br />
            Portez le consentement social.
          </p>
        </div>

        <div className="w-full h-px bg-brand-gray/10 animate-line-draw" />

        <div className="w-full flex flex-col gap-3 animate-stagger-2">
          <Link href="/shop"
            className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
            style={{ minHeight: '44px' }}
          >
            Découvrir le t-shirt
          </Link>
          <Link href="/"
            className="w-full py-3 border border-brand-gray/15 text-center font-ui text-[0.52rem] font-light tracking-[0.15em] uppercase text-brand-gray/35 hover:border-brand-gray/30 transition-colors"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            En savoir plus
          </Link>
        </div>

        <p className="font-ui text-[0.42rem] text-brand-gray/20 leading-relaxed animate-stagger-3">
          Votre lien d&apos;invitation est actif.<br />
          Il sera associé à votre commande.
        </p>
      </div>
    </main>
  );
}