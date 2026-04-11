'use client';
import Link from 'next/link';

export default function ShopError() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6">
      <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs md:max-w-sm">
        <div className="w-14 h-14 rounded-full border border-brand-gray/20 flex items-center justify-center">
          <span className="font-display text-xl font-light text-brand-gray/40">)(</span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-display text-2xl font-light">Boutique temporairement indisponible.</p>
          <p className="font-ui text-sm text-brand-gray/30 leading-relaxed">
            R&eacute;essayez dans quelques instants.
          </p>
        </div>
        <Link
          href="/"
          className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          &larr; retour &agrave; l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
