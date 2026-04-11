'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function LandingContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [scannerName, setScannerName] = useState('');
  const [hasMemberId, setHasMemberId] = useState(false);
  const [memberName, setMemberName]   = useState('');
  const [qrError, setQrError]         = useState('');
  const [ready, setReady]             = useState(false);

  useEffect(() => {
    // Ancien flow QR via /?id=xxx → redirige directement vers le profil
    const id = searchParams.get('id');
    if (id) {
      router.replace(`/profil/${id}`);
      return;
    }
    // QR code invalide
    const err = searchParams.get('error');
    if (err === 'qr_invalid') setQrError('Ce QR code est invalide.');
    else if (err === 'qr_not_found') setQrError('Ce QR code ne correspond à aucun membre.');

    const saved = localStorage.getItem('scannerName');
    const mid   = localStorage.getItem('memberId');
    const mName = localStorage.getItem('memberName');
    if (saved) setScannerName(saved);
    if (mid) setHasMemberId(true);
    if (mName) setMemberName(mName);
    setTimeout(() => setReady(true), 800);
  }, [searchParams, router]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center text-center gap-10 w-full max-w-xs md:max-w-sm">

        <div className="relative flex items-center justify-center animate-stagger-1">
          <div className="absolute w-24 h-24 rounded-full border border-brand-white/10 animate-ring-pulse" />
          <div className="w-[72px] h-[72px] rounded-full border border-brand-white/40 flex items-center justify-center">
            <span className="font-display text-3xl md:text-4xl font-light tracking-[0.05em]">)(</span>
          </div>
        </div>

        <div className="flex flex-col gap-5 animate-stagger-2">
          <h1 className="font-ui text-xs md:text-sm font-light tracking-[0.35em] uppercase text-brand-gray/60">
            In Real Society
          </h1>
          {qrError && (
            <div className="px-4 py-3 border border-red-500/20 rounded-[2px] mb-2">
              <p className="font-ui text-sm text-red-400/80 text-center">{qrError}</p>
            </div>
          )}
          {scannerName && hasMemberId ? (
            <div className="flex flex-col gap-2">
              <p className="font-display text-2xl md:text-3xl font-light leading-snug">
                Vous êtes de retour,<br />
                <span className="font-semibold italic">{scannerName}</span>.
              </p>
              {memberName && (
                <p className="font-ui text-xs text-brand-gray/30 tracking-[0.1em]">
                  Profil de <span className="text-brand-white/50">{memberName}</span>
                </p>
              )}
              <button
                onClick={() => { localStorage.removeItem('scannerName'); localStorage.removeItem('memberId'); setScannerName(''); setHasMemberId(false); }}
                aria-label="Changer d'identité — ce n'est pas vous"
                className="font-ui text-xs text-brand-gray/30 tracking-[0.1em] underline underline-offset-4 py-2"
                style={{ minHeight: '44px' }}
              >
                Ce n&apos;est pas vous ?
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="font-display text-2xl md:text-3xl font-light leading-snug tracking-[0.02em]">
                Le vêtement qui<br />
                <span className="text-brand-gray/50">dit oui.</span>
              </p>
              <p className="font-ui text-sm font-light text-brand-gray/50 leading-relaxed">
                Portez le consentement social.<br />
                Donnez le contrôle à ceux qui osent.
              </p>
              <div className="flex items-center justify-center gap-4">
                <span className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">Anonyme</span>
                <span className="text-brand-gray/15">·</span>
                <span className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">Éphémère</span>
                <span className="text-brand-gray/15">·</span>
                <span className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">Sécurisé</span>
              </div>
            </div>
          )}
        </div>

        {/* CTA principal */}
        <div
          className={`w-full flex flex-col gap-3 transition-all duration-500 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
        >
          {scannerName && hasMemberId ? (
            <Link href="/unlock"
              className="animate-shimmer w-full py-4 px-6 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
              style={{ minHeight: '44px' }}
            >
              Voir ce profil
            </Link>
          ) : (
            <Link href="/shop"
              className="animate-shimmer w-full py-4 px-6 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
              style={{ minHeight: '44px' }}
            >
              Découvrir le t-shirt
            </Link>
          )}
        </div>

        <p className="font-ui text-xs text-brand-gray/20 tracking-[0.25em] uppercase animate-stagger-4">
          The IRL Social Club
        </p>
      </div>

      {/* Liens discrets en bas */}
      <div className="absolute bottom-6 flex items-center justify-center gap-6 w-full px-6">
        <Link href="/manifeste"
          className="font-ui text-xxs md:text-xs text-brand-gray/15 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/40 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          Manifeste
        </Link>
        <span className="text-brand-gray/15">·</span>
        <Link href="/shop"
          className="font-ui text-xxs md:text-xs text-brand-gray/15 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/40 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          Boutique
        </Link>
        <span className="text-brand-gray/15">·</span>
        <Link href="/auth/login"
          className="font-ui text-xxs md:text-xs text-brand-gray/15 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/40 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          Membres
        </Link>
      </div>
    </main>
  );
}

export default function LandingClient() {
  return (
    <Suspense fallback={null}>
      <LandingContent />
    </Suspense>
  );
}
