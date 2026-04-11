'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s\-']{1,30}$/;

// UUID v4 regex pour valider le memberId
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function UnlockPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState('');
  const [error, setError]         = useState('');
  const [savedName, setSavedName] = useState('');
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
    const saved    = localStorage.getItem('scannerName');
    const memberId = localStorage.getItem('memberId');

    if (saved) { setSavedName(saved); setFirstName(saved); }

    // Vérifie que le memberId est un UUID valide
    if (!memberId || !UUID_REGEX.test(memberId)) {
      setNoProfile(true);
    }
  }, []);

  const validate = (value: string): string => {
    if (!value.trim()) return "L'audace commence par donner son prénom.";
    if (!NAME_REGEX.test(value.trim())) return 'Lettres uniquement, merci.';
    return '';
  };

  const handleUnlock = (e?: React.FormEvent) => {
    e?.preventDefault();
    const msg = validate(firstName);
    if (msg) { setError(msg); return; }

    const formatted = firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase();
    localStorage.setItem('scannerName', formatted);

    const memberId = localStorage.getItem('memberId');
    if (memberId && UUID_REGEX.test(memberId)) {
      router.push(`/profil/${memberId}`);
    } else {
      // Pas de profil valide → retour à l'accueil avec message
      router.push('/?no_profile=1');
    }
  };

  // Cas où on arrive sans QR code valide
  if (noProfile) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">
        <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs md:max-w-sm animate-stagger-1">
          <div className="w-14 h-14 rounded-full border border-brand-white/20 flex items-center justify-center">
            <span className="font-display text-base">X</span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-display text-2xl md:text-3xl font-light">Ce lien est incomplet.</p>
            <p className="font-ui text-sm text-brand-gray/40 leading-relaxed">
              Il vous faut un QR code valide<br />pour accéder à un profil.
            </p>
          </div>
          <button onClick={() => router.push('/')}
            className="font-ui text-sm text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
            style={{ minHeight: '44px' }}>
            ← retour à l&apos;accueil
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-9">

        <div className="text-center flex flex-col gap-3 animate-stagger-1">
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-[0.08em]">
            {savedName ? `C'est bien vous,` : 'Qui êtes-vous ?'}
          </h2>
          {savedName
            ? <p className="font-display text-2xl font-semibold">{savedName} ?</p>
            : (
              <div className="flex flex-col gap-1">
                <p className="font-ui text-sm font-light text-brand-gray/50">À qui ai-je l&apos;honneur.</p>
                <p className="font-ui text-xs text-brand-gray/25 tracking-[0.05em] leading-relaxed mt-1">
                  Votre prénom apparaîtra sur son profil.<br />Rien d&apos;autre n&apos;est demandé.
                </p>
              </div>
            )
          }
        </div>

        <form onSubmit={handleUnlock} className="w-full flex flex-col gap-6 animate-stagger-2" noValidate>
          <div className="flex flex-col gap-2">
            <input ref={inputRef} type="text" placeholder="votre prénom..." value={firstName}
              maxLength={30} autoComplete="given-name"
              onChange={(e) => { setFirstName(e.target.value); if (error) setError(''); }}
              className={`w-full bg-transparent border-b text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/20 ${error ? 'border-red-900' : 'border-brand-gray/20 focus:border-brand-white'}`}
              style={{ minHeight: '44px' }}
            />
            <div className={`font-ui text-sm text-red-900 tracking-wide transition-all duration-200 overflow-hidden ${error ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0'}`}>
              {error}
            </div>
          </div>

          <button type="submit"
            className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200"
            style={{ minHeight: '44px' }}
          >
            {savedName ? 'Continuer' : 'Déverrouiller'}
          </button>

          {savedName && (
            <button type="button"
              onClick={() => { setSavedName(''); setFirstName(''); localStorage.removeItem('scannerName'); }}
              className="font-ui text-sm text-brand-gray/30 tracking-[0.1em] underline underline-offset-4 py-2"
              style={{ minHeight: '44px' }}
            >
              Ce n&apos;est pas moi
            </button>
          )}
        </form>

        <button onClick={() => router.push('/')}
          className="font-ui text-sm text-brand-gray/40 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors py-2"
          style={{ minHeight: '44px' }}
        >
          ← retour
        </button>
      </div>
    </main>
  );
}
