'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { BrandMark } from '@/app/components/ui/BrandMark';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6">
      <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs md:max-w-sm">
        <div className="w-14 h-14 rounded-full border border-brand-gray/20 flex items-center justify-center">
          <span className="font-display text-xl font-light text-brand-gray/50"><BrandMark /></span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-display text-2xl font-light">Dashboard temporairement indisponible.</p>
          <p className="font-ui text-sm text-brand-gray/55 leading-relaxed">Réessayez dans quelques instants.</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button onClick={reset}
            className="px-6 py-3 bg-brand-white text-brand-black font-ui font-bold text-xs tracking-[0.2em] uppercase rounded-[2px] hover:bg-gray-100 transition-colors"
            style={{ minHeight: '44px' }}>
            Réessayer
          </button>
          <Link href="/" className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-2"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
            ← retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
