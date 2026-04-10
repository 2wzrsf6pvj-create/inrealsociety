'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const status       = searchParams.get('status') ?? 'success';
  const memberId     = searchParams.get('memberId') ?? '';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Petit délai pour l'animation d'entrée
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const isSuccess = status === 'success';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${isSuccess ? 'rgba(255,255,255,0.08)' : 'rgba(120,20,20,0.15)'} 0%, transparent 70%)` }} />

      <div className={`z-10 flex flex-col items-center w-full max-w-xs gap-8 text-center transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* Ligne décorative */}
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/30 to-transparent" />

        {/* Icône */}
        <div className="w-16 h-16 rounded-full border border-brand-white/20 flex items-center justify-center">
          <span className="text-2xl">{isSuccess ? '✦' : '×'}</span>
        </div>

        {/* Titre */}
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2rem] font-light leading-[1.2] tracking-[0.04em]">
            {isSuccess ? 'Commande confirmée.' : 'Paiement annulé.'}
          </h1>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/60 leading-relaxed tracking-wide">
            {isSuccess
              ? "Votre T-shirt est en cours de production.\nVotre QR code sera imprimé sur le dos.\nLivraison sous 5 à 10 jours ouvrés."
              : 'Votre paiement n\'a pas été finalisé.\nVous pouvez réessayer depuis votre dashboard.'
            }
          </p>
        </div>

        {/* Détails commande (succès uniquement) */}
        {isSuccess && (
          <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-brand-gray/10" />
              <span className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">récapitulatif</span>
              <div className="flex-1 h-px bg-brand-gray/10" />
            </div>
            {[
              { label: 'Produit',    value: 'Comfort Colors 1717' },
              { label: 'Impression', value: 'DTFlex — dos du t-shirt' },
              { label: 'Statut',     value: 'En production' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.1em] uppercase">{row.label}</span>
                <span className="font-ui text-[0.6rem] font-light text-brand-white/70">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/30 to-transparent" />

        {/* CTA */}
        <div className="w-full flex flex-col gap-3">
          {memberId ? (
            <Link
              href={`/dashboard/${memberId}`}
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
            >
              Retour au dashboard
            </Link>
          ) : (
            <Link
              href="/"
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 block text-center"
            >
              Retour à l'accueil
            </Link>
          )}
        </div>

      </div>
    </main>
  );
}