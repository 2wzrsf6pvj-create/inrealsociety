'use client';
import Link from 'next/link';

export default function DashboardError() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6">
      <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs">
        <div className="w-14 h-14 rounded-full border border-brand-gray/20 flex items-center justify-center">
          <span className="font-display text-xl font-light text-brand-gray/40">X</span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-display text-[1.4rem] font-light">Dashboard temporairement indisponible.</p>
          <p className="font-ui text-[0.55rem] text-brand-gray/30 leading-relaxed">Réessayez dans quelques instants.</p>
        </div>
        <Link href="/" className="font-ui text-[0.52rem] text-brand-gray/25 tracking-[0.15em] uppercase underline underline-offset-4 py-3" style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          ↩ retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}