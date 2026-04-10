'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Member } from '@/lib/types';

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function useCountdown(firstScanAt: string | null) {
  const [timeLeft, setTimeLeft] = useState({ hours: 24, minutes: 0, percent: 100 });
  useEffect(() => {
    const update = () => {
      const start     = firstScanAt ? new Date(firstScanAt).getTime() : Date.now();
      const total     = 24 * 60 * 60 * 1000;
      const remaining = Math.max(0, total - (Date.now() - start));
      setTimeLeft({
        hours:   Math.floor(remaining / 3_600_000),
        minutes: Math.floor((remaining % 3_600_000) / 60_000),
        percent: Math.round((remaining / total) * 100),
      });
    };
    update();
    const iv = setInterval(update, 60_000);
    return () => clearInterval(iv);
  }, [firstScanAt]);
  return timeLeft;
}

export default function ProfilClient({
  member,
  firstScanAt,
}: {
  member: Member;
  firstScanAt: string | null;
}) {
  const [scannerName, setScannerName] = useState('');
  const [convUrl, setConvUrl]         = useState<string | null>(null);
  const countdown = useCountdown(firstScanAt);
  const isExpired = countdown.percent === 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const name = localStorage.getItem('scannerName') ?? '';
    setScannerName(name);

    // Vérifie si une conversation existe déjà pour ce membre
    const existingConv = localStorage.getItem(`conversation_${member.id}`);
    if (existingConv) setConvUrl(existingConv);

    // Enregistre le scan
    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, scannerName: name || null }),
    }).catch(() => {});
  }, [member.id]);

  // Profil en pause
  if (member.is_paused) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
        <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs">
          <div className="w-20 h-20 rounded-full border border-brand-gray/15 flex items-center justify-center">
            <span className="font-display text-2xl font-light text-brand-gray/30">{getInitials(member.name)}</span>
          </div>
          <div className="flex flex-col gap-3">
            <p className="font-display text-[1.4rem] font-light tracking-[0.04em]">Ce membre est indisponible.</p>
            <p className="font-ui text-[0.55rem] text-brand-gray/30 leading-relaxed">
              Peut-être une prochaine fois.
            </p>
          </div>
          <Link href="/" className="font-ui text-[0.48rem] text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 py-2" style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
            ↩ retour
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-52 h-52 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-6">

        {/* Tag */}
        <div className="flex items-center gap-3 w-full animate-stagger-1">
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" />
          <span className="font-ui text-[0.45rem] text-brand-gray/30 tracking-[0.2em] uppercase">profil</span>
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-2 animate-stagger-2">
          <div className="relative">
            <div className="absolute inset-[-8px] rounded-full border border-brand-white/5 animate-ring-pulse" />
            <div className="w-28 h-28 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
              {member.photo_url ? (
                /* Optimisation URL Supabase Storage */
                <img
                  src={`${member.photo_url}?width=400&quality=80`}
                  alt={member.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = member.photo_url!; }}
                />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="font-display text-3xl font-light text-brand-gray/50 tracking-wider leading-none">
                    {getInitials(member.name)}
                  </span>
                  <div className="w-8 h-px bg-brand-gray/20" />
                </div>
              )}
            </div>
          </div>
          <p className="font-ui text-[0.62rem] font-medium tracking-[0.25em] text-brand-white/80">
            {member.name.toUpperCase()}
          </p>
        </div>

        {/* Corps */}
        {!isExpired ? (
          <div className="flex flex-col items-center gap-4 animate-stagger-3">
            <h1 className="font-display text-[1.4rem] font-light tracking-[0.04em] text-center leading-snug">
              {scannerName
                ? <>Nos chemins se sont croisés,<br /><span className="font-semibold italic">{scannerName}</span>.</>
                : <>Nos chemins se sont croisés.</>
              }
            </h1>
            <p className="font-display text-[0.92rem] font-light italic text-brand-gray/60 text-center leading-relaxed">
              &ldquo;{member.pitch}&rdquo;
            </p>
            <p className="font-ui text-[0.52rem] font-light text-brand-gray/35 text-center leading-relaxed tracking-wide">
              Le monde va trop vite.<br />Prenons le temps.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 opacity-40 animate-stagger-3">
            <p className="font-display text-[1.1rem] font-light italic text-center">Ce moment est passé.</p>
            <p className="font-ui text-[0.55rem] text-brand-gray/50 text-center">La prochaine occasion sera la bonne.</p>
          </div>
        )}

        <div className="w-full h-px bg-brand-gray/10 animate-line-draw animate-stagger-4" />

        {/* CTAs */}
        {!isExpired && (
          <div className="w-full flex flex-col gap-3 animate-stagger-4">
            {/* Retrouver conversation existante */}
            {convUrl && (
              <Link href={convUrl}
                className="w-full py-3 border border-brand-white/20 text-center font-ui text-[0.55rem] font-light tracking-[0.15em] hover:border-brand-white/40 transition-colors"
                style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Retrouver votre conversation →
              </Link>
            )}

            <Link
              href={`/message?to=${member.id}&name=${encodeURIComponent(member.name)}`}
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center block"
              style={{ minHeight: '44px' }}
            >
              {convUrl ? 'Envoyer un autre message' : 'Lui envoyer un message'}
            </Link>

            {member.instagram && (
              <div className="flex flex-col items-center gap-1">
                <p className="font-ui text-[0.42rem] text-brand-gray/25 tracking-[0.15em] uppercase">ou retrouvez-le sur</p>
                <a
                  href={`https://instagram.com/${member.instagram.replace('@', '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 border border-brand-gray/15 text-center font-ui text-[0.55rem] font-light tracking-[0.15em] hover:border-brand-gray/40 transition-colors"
                  style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  @{member.instagram.replace('@', '')}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Countdown en bas */}
        <div className="w-full flex flex-col gap-2 animate-stagger-5 mt-2">
          <div className="flex items-center justify-between">
            <span className="font-ui text-[0.42rem] text-brand-gray/20 tracking-[0.2em] uppercase">Occasion éphémère</span>
            <span className="font-ui text-[0.42rem] text-brand-gray/20 tabular-nums">
              {isExpired ? 'Expiré' : `${countdown.hours}h ${countdown.minutes}m`}
            </span>
          </div>
          <div className="w-full h-px bg-brand-gray/10 relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full bg-brand-white/20 transition-all duration-1000"
              style={{ width: `${countdown.percent}%` }} />
          </div>
        </div>

        <Link href="/"
          className="font-ui text-[0.48rem] text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors py-2"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          ↩ retour
        </Link>
      </div>
    </main>
  );
}