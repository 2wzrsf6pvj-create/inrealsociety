'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Member } from '@/lib/types';

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

import { SCAN_WINDOW_MS } from '@/lib/constants';
import type { MemberPlan } from '@/lib/types';

function useCountdown(firstScanAt: string | null, plan?: MemberPlan) {
  const safePlan = (plan === 'premium' ? 'premium' : 'free') as keyof typeof SCAN_WINDOW_MS;
  const windowMs = SCAN_WINDOW_MS[safePlan];
  const windowH  = windowMs / 3_600_000;
  const [timeLeft, setTimeLeft] = useState({ hours: windowH, minutes: 0, seconds: 0, percent: 100, active: false });
  useEffect(() => {
    if (!firstScanAt) {
      setTimeLeft({ hours: windowH, minutes: 0, seconds: 0, percent: 100, active: false });
      return;
    }
    const update = () => {
      const start     = new Date(firstScanAt).getTime();
      const total     = windowMs;
      const remaining = Math.max(0, total - (Date.now() - start));
      setTimeLeft({
        hours:   Math.floor(remaining / 3_600_000),
        minutes: Math.floor((remaining % 3_600_000) / 60_000),
        seconds: Math.floor((remaining % 60_000) / 1_000),
        percent: Math.round((remaining / total) * 100),
        active:  true,
      });
    };
    update();
    const iv = setInterval(update, 1_000);
    return () => clearInterval(iv);
  }, [firstScanAt, windowMs, windowH]);
  return timeLeft;
}

export default function ProfilClient({
  member,
  firstScanAt,
  isOwner = false,
}: {
  member: Member;
  firstScanAt: string | null;
  isOwner?: boolean;
}) {
  const [scannerName, setScannerName] = useState('');
  const [convUrl, setConvUrl]         = useState<string | null>(null);
  const countdown = useCountdown(firstScanAt, member.plan);
  const isExpired = countdown.active && countdown.percent === 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Le propriétaire n'a pas besoin du contexte scanner
    if (isOwner) return;

    const name = localStorage.getItem('scannerName') ?? '';
    setScannerName(name);

    const existingConv = localStorage.getItem(`conversation_${member.id}`);
    if (existingConv) {
      try {
        const url = new URL(existingConv);
        setConvUrl(url.pathname);
      } catch {
        setConvUrl(existingConv);
      }
    }

    // Sauvegarde le nom du membre pour le retour sur la landing
    localStorage.setItem('memberName', member.name);
    localStorage.setItem('memberId', member.id);

    // Tente d'obtenir la géoloc du scanner (non-bloquant)
    const sendScan = (lat?: number, lng?: number) => {
      fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          scannerName: name || null,
          latitude: lat,
          longitude: lng,
        }),
      }).catch(() => {});
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendScan(pos.coords.latitude, pos.coords.longitude),
        () => sendScan(), // Refusé ou erreur → scan sans géoloc
        { timeout: 5000, maximumAge: 60000 }
      );
    } else {
      sendScan();
    }
  }, [member.id, isOwner]);

  // Profil en pause
  if (member.is_paused) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
        <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs md:max-w-sm">
          <div className="w-20 h-20 rounded-full border border-brand-gray/15 flex items-center justify-center">
            <span className="font-display text-2xl font-light text-brand-gray/30">{getInitials(member.name)}</span>
          </div>
          <div className="flex flex-col gap-3">
            <p className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">Ce membre est indisponible.</p>
            <p className="font-ui text-sm text-brand-gray/30 leading-relaxed">
              Peut-être une prochaine fois.
            </p>
          </div>
          <Link href="/" className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 py-2" style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
            ← retour
          </Link>
        </div>
      </main>
    );
  }

  const instagramHandle = member.instagram?.replace('@', '') || '';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-52 h-52 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-6">

        {/* Tag */}
        <div className="flex items-center gap-3 w-full animate-stagger-1">
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" />
          <span className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">profil</span>
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-2 animate-stagger-2">
          <div className="relative">
            <div className="absolute inset-[-8px] rounded-full border border-brand-white/5 animate-ring-pulse" />
            <div className="w-28 h-28 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={`Photo de ${member.name}`}
                  width={112}
                  height={112}
                  className="w-full h-full object-cover"
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
          <div className="flex items-center gap-2">
            <p className="font-ui text-sm font-medium tracking-[0.25em] text-brand-white/80">
              {member.name.toUpperCase()}
            </p>
            {member.plan === 'premium' && (
              <span className="font-ui text-xs text-[#C5A059]/70" title="Membre premium">✦</span>
            )}
          </div>
        </div>

        {/* Corps */}
        {isOwner ? (
          /* ─── Vue propriétaire ─────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 animate-stagger-3">
            <p className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">Votre profil public</p>
            <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/60 text-center leading-relaxed">
              &ldquo;{member.pitch}&rdquo;
            </p>
            {instagramHandle && (
              <p className="font-ui text-xs text-brand-gray/30">@{instagramHandle}</p>
            )}
          </div>
        ) : !isExpired ? (
          <div className="flex flex-col items-center gap-4 animate-stagger-3">
            <h1 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em] text-center leading-snug">
              {scannerName
                ? <>Nos chemins se sont croisés,<br /><span className="font-semibold italic">{scannerName}</span>.</>
                : <>Quelque chose vous a arrêté.<br /><span className="text-brand-gray/50">C&apos;est rare.</span></>
              }
            </h1>
            <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/60 text-center leading-relaxed">
              &ldquo;{member.pitch}&rdquo;
            </p>
            {!scannerName && (
              <p className="font-ui text-xs md:text-sm font-light text-brand-gray/35 text-center leading-relaxed tracking-wide">
                Ce vêtement signifie que son porteur est ouvert<br />à une conversation. Vous avez le contrôle.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-stagger-3">
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
            <p className="font-display text-xl font-light italic text-center text-brand-gray/40">Ce moment est passé.</p>
            <p className="font-ui text-xs md:text-sm text-brand-gray/25 text-center leading-relaxed">
              La fenêtre de 24 heures est terminée.<br />La prochaine occasion sera la bonne.
            </p>
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
          </div>
        )}

        <div className="w-full h-px bg-brand-gray/10 animate-line-draw animate-stagger-4" />

        {/* CTAs */}
        {isOwner ? (
          /* ─── Actions propriétaire ─────────────────────────────────────── */
          <div className="w-full flex flex-col gap-3 animate-stagger-4">
            <p className="font-ui text-xxs text-brand-gray/25 text-center leading-relaxed">
              C&apos;est ce que les scanneurs voient quand ils scannent votre QR code.
            </p>
            <Link href="/dashboard"
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center block"
              style={{ minHeight: '44px' }}
            >
              Mon dashboard
            </Link>
            <Link href="/register?edit=1"
              className="w-full py-3 border border-brand-gray/20 text-center font-ui text-sm font-light tracking-[0.15em] uppercase hover:border-brand-gray/40 transition-colors"
              style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Modifier mon profil
            </Link>
          </div>
        ) : !isExpired && (
          <div className="w-full flex flex-col gap-3 animate-stagger-4">
            {convUrl && (
              <Link href={convUrl}
                className="w-full py-3 border border-brand-white/20 text-center font-ui text-sm font-light tracking-[0.15em] hover:border-brand-white/40 transition-colors"
                style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Retrouver votre conversation
              </Link>
            )}

            <Link
              href={`/message?to=${member.id}&name=${encodeURIComponent(member.name)}`}
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center block"
              style={{ minHeight: '44px' }}
            >
              {convUrl ? 'Envoyer un autre message' : 'Lui envoyer un message'}
            </Link>

            {instagramHandle && (
              <div className="flex flex-col items-center gap-1">
                <p className="font-ui text-xxs md:text-xs text-brand-gray/25 tracking-[0.15em] uppercase">ou retrouvez ce membre sur</p>
                <a
                  href={`https://instagram.com/${instagramHandle}`}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 border border-brand-gray/15 text-center font-ui text-sm font-light tracking-[0.15em] hover:border-brand-gray/40 transition-colors"
                  style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  @{instagramHandle}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Countdown — visible seulement pour les scanners */}
        {!isOwner && (
          <div className="w-full flex flex-col gap-2 animate-stagger-5 mt-2">
            <div className="flex items-center justify-between">
              <span className="font-ui text-xxs md:text-xs text-brand-gray/20 tracking-[0.2em] uppercase">
                {countdown.active ? 'Occasion éphémère' : 'Profil actif'}
              </span>
              <span className="font-ui text-xxs md:text-xs text-brand-gray/20 tabular-nums">
                {isExpired ? 'Expiré' : countdown.active ? `${countdown.hours}h ${String(countdown.minutes).padStart(2, '0')}m ${String(countdown.seconds).padStart(2, '0')}s` : `${SCAN_WINDOW_MS[member.plan === 'premium' ? 'premium' : 'free'] / 3_600_000}h`}
              </span>
            </div>
            <div className="w-full h-px bg-brand-gray/10 relative overflow-hidden">
              <div className="absolute left-0 top-0 h-full bg-brand-white/20 transition-all duration-1000"
                style={{ width: `${countdown.percent}%` }} />
            </div>
          </div>
        )}

        <Link href={isOwner ? '/dashboard' : '/'}
          className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors py-2"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          {isOwner ? '← retour au dashboard' : '← retour'}
        </Link>
      </div>
    </main>
  );
}
