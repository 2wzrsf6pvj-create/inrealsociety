'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface MemberData {
  name: string;
  pitch: string;
  insta: string;
  isEmpty: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SpeakOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-brand-black animate-overlay px-8 text-center"
      onClick={onClose}
    >
      <div className="w-px h-10 bg-gradient-to-b from-transparent via-brand-white/40 to-transparent animate-stagger-1" />

      <div className="w-14 h-14 rounded-full border border-brand-white/30 flex items-center justify-center animate-stagger-2">
        <span className="text-2xl select-none">👁</span>
      </div>

      <div className="flex flex-col gap-3 animate-stagger-3">
        <p className="font-display text-[2rem] font-light leading-[1.2] tracking-[0.04em]">
          Lève la tête<br />de ton écran.
        </p>
        <p className="font-ui text-[0.58rem] font-light text-brand-gray/60 tracking-[0.25em] uppercase">
          Je suis juste en face de toi.
        </p>
      </div>

      <div className="w-px h-10 bg-gradient-to-b from-transparent via-brand-white/40 to-transparent animate-stagger-4" />

      <button
        className="font-ui text-[0.55rem] text-brand-gray/30 tracking-[0.2em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors animate-stagger-5"
        onClick={onClose}
      >
        fermer
      </button>
    </div>
  );
}

export default function ProfilPage() {
  const [scannerName, setScannerName] = useState('');
  const [member, setMember] = useState<MemberData>({ name: '', pitch: '', insta: '', isEmpty: true });
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setScannerName(localStorage.getItem('scannerName') ?? '');
    const mName  = localStorage.getItem('memberName')  ?? '';
    const mPitch = localStorage.getItem('memberPitch') ?? '';
    const mInsta = localStorage.getItem('memberInsta') ?? '';
    setMember({ name: mName || 'Membre', pitch: mPitch, insta: mInsta, isEmpty: !mName && !mPitch });
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">

      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-52 h-52 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-6">

        {/* Tag avec line-draw */}
        <div className="flex items-center gap-3 w-full animate-stagger-1">
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" />
          <span className="font-ui text-[0.5rem] text-brand-gray/40 tracking-[0.2em] uppercase">profil scanné</span>
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-2 animate-stagger-2">
          <div className="relative">
            <div className="absolute inset-[-8px] rounded-full border border-brand-white/5 animate-ring-pulse" />
            <div className="w-24 h-24 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center">
              {member.isEmpty
                ? <div className="w-6 h-px bg-brand-gray/30" />
                : <span className="font-display text-2xl font-light text-brand-gray/60 tracking-wider">{getInitials(member.name)}</span>
              }
            </div>
          </div>
          <p className="font-ui text-[0.65rem] font-medium tracking-[0.25em] text-brand-white">
            {member.name.toUpperCase()}
          </p>
        </div>

        {/* Corps */}
        {member.isEmpty ? (
          <div className="flex flex-col items-center gap-4 py-4 opacity-50 animate-stagger-3">
            <div className="w-5 h-px bg-brand-white" />
            <p className="font-display text-[1rem] font-light text-brand-gray italic text-center">
              Ce membre prépare son entrée.
            </p>
            <div className="w-5 h-px bg-brand-white" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-stagger-3">
            <h1 className="font-display text-[1.5rem] font-light tracking-[0.05em]">
              Salut <span className="font-semibold">{scannerName || "l'inconnu(e)"}</span>,
            </h1>
            <p className="font-display text-[0.95rem] font-light italic text-brand-gray/70 text-center leading-relaxed">
              "{member.pitch}"
            </p>
          </div>
        )}

        {/* Séparateur line-draw */}
        <div className="w-full h-px bg-brand-gray/10 animate-line-draw animate-stagger-4" />

        {/* CTAs */}
        <div className="w-full flex flex-col gap-3 animate-stagger-4">
          {!member.isEmpty && (
            <button
              onClick={() => setShowOverlay(true)}
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200"
            >
              Viens me parler
            </button>
          )}
          {member.insta && (
            <a
              href={`https://instagram.com/${member.insta.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 border border-brand-gray/20 text-center font-ui text-[0.58rem] font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors"
            >
              @{member.insta.replace('@', '')}
            </a>
          )}
        </div>

        <Link
          href="/"
          className="font-ui text-[0.55rem] text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors mt-2 animate-stagger-5"
        >
          ↩ retour au sas
        </Link>
      </div>

      {showOverlay && <SpeakOverlay onClose={() => setShowOverlay(false)} />}
    </main>
  );
}