'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { captureEvent } from '@/lib/posthog-client';
import SunToggle from '@/app/components/ui/SunToggle';
import type { Member } from '@/lib/types';

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

import { SCAN_WINDOW_MS } from '@/lib/constants';
import type { MemberPlan } from '@/lib/types';
import { BrandMark } from '@/app/components/ui/BrandMark';

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
  preview = false,
}: {
  member: Member;
  firstScanAt: string | null;
  isOwner?: boolean;
  preview?: boolean;
}) {
  const [scannerName, setScannerName] = useState('');
  const [convUrl, setConvUrl]         = useState<string | null>(null);
  // Priming géoloc : on demande la position via une carte explicite, jamais le
  // prompt natif d'emblée (intrusif pour un inconnu qui vient de scanner).
  const [askLocation, setAskLocation] = useState(false);
  const scanSentRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // En aperçu, le porteur voit la vue SCANNEUR de son propre profil (pas la vue
  // propriétaire) — pour « vivre son premier scan ».
  const showOwnerView = isOwner && !preview;

  // Fenêtre PAR RENCONTRE : l'arrivée d'un scanneur EST un scan (auto-enregistré au
  // mount / au clic sur le CTA) qui ROUVRE la fenêtre. On compte donc depuis SON
  // arrivée, pas depuis `firstScanAt` (le dernier scan global). Sinon, tout scanneur
  // arrivant +24h après le scan précédent voyait « Ce moment est passé » avec le CTA
  // masqué — alors que son propre scan venait justement de rouvrir la fenêtre côté
  // serveur (cul-de-sac du « deuxième jour », le cas le plus courant). Le propriétaire
  // (compte à rebours masqué) conserve `firstScanAt`.
  const [arrivalAt, setArrivalAt] = useState<string | null>(null);
  useEffect(() => { setArrivalAt(new Date().toISOString()); }, []);
  const windowStart = showOwnerView ? firstScanAt : arrivalAt;
  const countdown = useCountdown(windowStart, member.plan);

  // Expiré = temps réel écoulé (pas le `percent` arrondi, qui tombe à 0 ~7 min
  // avant la vraie fin et masquerait le CTA alors que le serveur accepte encore).
  const isExpired = countdown.active && countdown.hours === 0 && countdown.minutes === 0 && countdown.seconds === 0;
  // Dernière heure : l'occasion file → on passe le compte à rebours en or + pulse
  // pour rendre l'éphémère RESSENTI au moment de décision (sans clignoter fort).
  const urgent = countdown.active && !isExpired && countdown.hours === 0;

  // Enregistre le scan UNE seule fois (ref-guard). keepalive : survit à la
  // navigation (ex. clic immédiat sur « Lui envoyer un message »). La géoloc est
  // optionnelle — passée seulement si le scanneur l'a explicitement partagée.
  const sendScan = useCallback((lat?: number, lng?: number) => {
    if (scanSentRef.current) return;
    scanSentRef.current = true;
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    captureEvent('scan_submitted', { member_id: member.id, has_location: lat != null && lng != null });
    const name = localStorage.getItem('scannerName') || null;
    fetch('/api/scan', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ memberId: member.id, scannerName: name, latitude: lat, longitude: lng }),
    }).catch(() => {});
  }, [member.id]);

  const shareLocation = useCallback(() => {
    setAskLocation(false);
    // Pas de filet de sécurité ici : un prompt natif lent ne doit pas être coupé
    // par le timeout (sinon le scan partirait sans la position acceptée).
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendScan(pos.coords.latitude, pos.coords.longitude),
        () => sendScan(), // refusé / erreur → scan sans géoloc
        { timeout: 10000, maximumAge: 60000 },
      );
    } else {
      sendScan();
    }
  }, [sendScan]);

  const declineLocation = useCallback(() => { setAskLocation(false); sendScan(); }, [sendScan]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Le propriétaire n'a pas besoin du contexte scanner. Un profil en pause non
    // plus : on évite la carte de géoloc + l'appel /api/scan inutiles.
    if (isOwner || member.is_paused) return;

    captureEvent('profile_viewed', { member_id: member.id, plan: member.plan });

    setScannerName(localStorage.getItem('scannerName') ?? '');

    const existingConv = localStorage.getItem(`conversation_${member.id}`);
    if (existingConv) {
      // N'accepte qu'un chemin INTERNE (commence par « / ») : le localStorage sert de
      // href, un `javascript:`/URL externe ouvrirait une surface (self-XSS/redirect).
      let path: string | null = null;
      try { path = new URL(existingConv).pathname; } catch { path = existingConv; }
      if (path && path.startsWith('/')) setConvUrl(path);
    }

    // Sauvegarde le nom du membre pour le retour sur la landing
    localStorage.setItem('memberName', member.name);
    localStorage.setItem('memberId', member.id);

    // Affiche la carte de priming. Filet de sécurité : si le scanneur ne décide
    // rien, le scan part SANS localisation après 6 s — il est dédupliqué côté
    // serveur (IP+membre, 30 min) donc aucun double même si un envoi suit.
    setAskLocation(true);
    // Ferme la carte AVANT l'auto-envoi : sinon elle reste affichée après le scan
    // fallback, et un clic « Partager ma ville » ensuite déclenche le prompt natif
    // de géoloc pour rien (sendScan est déjà ref-gardé → la position est jetée).
    fallbackRef.current = setTimeout(() => { setAskLocation(false); sendScan(); }, 6000);
    return () => { if (fallbackRef.current) clearTimeout(fallbackRef.current); };
  }, [member.id, isOwner, member.is_paused, member.name, member.plan, sendScan]);

  // Mesure l'engagement « vis ton premier scan » (cold-start).
  useEffect(() => {
    if (preview) captureEvent('activation_preview_viewed', { member_id: member.id });
  }, [preview, member.id]);

  // Profil en pause — sauf en aperçu (le porteur veut voir l'expérience réelle
  // pour se motiver à reprendre/porter ; un scanneur réel verrait l'indispo).
  if (member.is_paused && !preview) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
        <div className="z-10 flex flex-col items-center text-center gap-6 w-full max-w-xs md:max-w-sm">
          <div className="w-20 h-20 rounded-full border border-brand-gray/15 flex items-center justify-center">
            <span className="font-display text-2xl font-light text-brand-gray/55">{getInitials(member.name)}</span>
          </div>
          <div className="flex flex-col gap-3">
            <p className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">Ce membre est indisponible.</p>
            <p className="font-ui text-sm text-brand-gray/55 leading-relaxed">
              Peut-être une prochaine fois.
            </p>
          </div>
          <Link href="/" className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 py-2" style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
            ← retour
          </Link>
        </div>
      </main>
    );
  }

  const instagramHandle = member.instagram?.replace('@', '') || '';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <SunToggle />
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-52 h-52 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)' }} />

      {/* Signature de marque : le logo ( • ) en filigrane. */}
      <div aria-hidden="true" className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <span className="font-display font-light leading-none text-brand-white/[0.02]" style={{ fontSize: 'min(80vw, 58vh)' }}><BrandMark /></span>
      </div>

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-6">

        {/* Bannière aperçu (porteur en mode « vis ton premier scan ») */}
        {preview && (
          <div className="w-full bg-[#0a0a08] border border-[#C5A059]/25 rounded-[2px] px-4 py-3 flex flex-col gap-1 text-center">
            <p className="font-ui text-xxs text-[#C5A059]/80 tracking-[0.18em] uppercase">✦ Aperçu</p>
            <p className="font-ui text-xs text-brand-gray/50 leading-relaxed">
              Voici ce qu&apos;un scanneur voit en vous scannant. Portez votre t-shirt pour que ça arrive en vrai.
            </p>
          </div>
        )}

        {/* Tag */}
        <div className="flex items-center gap-3 w-full animate-stagger-1">
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" />
          <span className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">profil</span>
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Avatar — scan sweep au mount pour rappeler le concept "être scanné" */}
        <div className="flex flex-col items-center gap-2 animate-stagger-2">
          <div className="relative">
            <div className="absolute inset-[-8px] rounded-full border border-brand-white/5 animate-ring-pulse" />
            <div className="animate-scan w-28 h-28 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
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
        {showOwnerView ? (
          /* ─── Vue propriétaire ─────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 animate-stagger-3">
            <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Votre profil public</p>
            <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/75 text-center leading-relaxed">
              &ldquo;{member.pitch}&rdquo;
            </p>
            {instagramHandle && (
              <p className="font-ui text-xs text-brand-gray/55">@{instagramHandle}</p>
            )}
          </div>
        ) : !isExpired ? (
          <div className="flex flex-col items-center gap-4 animate-stagger-3">
            <h1 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em] text-center leading-snug">
              {scannerName
                ? <>Nos chemins se sont croisés,<br /><span className="font-semibold italic">{scannerName}</span>.</>
                : <>Quelque chose vous a arrêté.<br /><span className="text-brand-gray/65">C&apos;est rare.</span></>
              }
            </h1>
            <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/75 text-center leading-relaxed">
              &ldquo;{member.pitch}&rdquo;
            </p>
            {!scannerName && (
              <p className="font-ui text-sm font-light text-brand-gray/75 text-center leading-relaxed tracking-wide">
                Ce vêtement signifie que son porteur est ouvert<br />à une conversation. Vous avez le contrôle.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 animate-stagger-3">
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
            <p className="font-display text-xl font-light italic text-center text-brand-gray/50">Ce moment est passé.</p>
            <p className="font-ui text-xs md:text-sm text-brand-gray/55 text-center leading-relaxed">
              La fenêtre de {SCAN_WINDOW_MS[member.plan === 'premium' ? 'premium' : 'free'] / 3_600_000} heures est terminée.<br />Un nouveau scan relancera le compteur.
            </p>
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
          </div>
        )}

        <div className="w-full h-px bg-brand-gray/10 animate-line-draw animate-stagger-4" />

        {/* CTAs */}
        {showOwnerView ? (
          /* ─── Actions propriétaire ─────────────────────────────────────── */
          <div className="w-full flex flex-col gap-3 animate-stagger-4">
            <p className="font-ui text-xxs text-brand-gray/55 text-center leading-relaxed">
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

            {/* #4 — contact requis annoncé en amont (évite la surprise sur la
                page message). En aperçu aussi pour que le porteur le voie. */}
            {member.require_contact && (
              <p className="font-ui text-xxs text-[#C5A059]/80 tracking-[0.05em] text-center leading-relaxed">
                Ce membre demande un @instagram ou un email pour pouvoir répondre.
              </p>
            )}

            <Link
              onClick={() => { if (!preview) sendScan(); }}
              href={`/message?to=${member.id}&name=${encodeURIComponent(member.name)}${member.require_contact ? '&rc=1' : ''}${preview ? '&preview=1' : ''}`}
              className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center block"
              style={{ minHeight: '44px' }}
            >
              {convUrl ? 'Envoyer un autre message' : 'Lui envoyer un message'}
            </Link>

            {instagramHandle && (
              <div className="flex flex-col items-center gap-1">
                <p className="font-ui text-xxs md:text-xs text-brand-gray/55 tracking-[0.15em] uppercase">ou retrouvez ce membre sur</p>
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

        {/* #1 — Priming géoloc : carte explicite (pas de prompt natif d'emblée).
            Visible uniquement pour un vrai scanneur, tant qu'il n'a pas décidé. */}
        {askLocation && !isExpired && (
          <div className="w-full bg-[#080808] border border-brand-gray/15 rounded-[2px] px-4 py-3 flex flex-col gap-2.5 animate-fade-in">
            <p className="font-ui text-sm text-brand-gray/75 leading-relaxed text-center">
              Partager ta ville approximative à <span className="text-brand-white/85">{member.name}</span> ?
              <br /><span className="text-brand-gray/60">Jamais ta position exacte.</span>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={shareLocation}
                className="flex-1 py-2.5 border border-brand-white/25 font-ui text-xxs tracking-[0.15em] uppercase hover:border-brand-white/50 hover:bg-brand-white/5 active:scale-[0.98] transition-all rounded-[1px]"
                style={{ minHeight: '44px' }}>
                Partager ma ville
              </button>
              <button onClick={declineLocation}
                className="flex-1 py-2.5 border border-brand-gray/15 font-ui text-xxs tracking-[0.15em] uppercase text-brand-gray/55 hover:border-brand-gray/30 transition-all rounded-[1px]"
                style={{ minHeight: '44px' }}>
                Non merci
              </button>
            </div>
          </div>
        )}

        {/* Countdown — visible pour les scanners (et en aperçu porteur) */}
        {!showOwnerView && (
          <div className="w-full flex flex-col gap-2 animate-stagger-5 mt-2">
            <div className="flex items-center justify-between">
              <span className={`font-ui text-xxs md:text-xs tracking-[0.2em] uppercase transition-colors ${urgent ? 'text-brand-accent/90 animate-count-urgent' : 'text-brand-gray/50'}`}>
                {isExpired ? 'Occasion passée' : urgent ? 'Dernière heure' : countdown.active ? 'Occasion éphémère' : 'Profil actif'}
              </span>
              <span className={`font-ui text-xxs md:text-xs tabular-nums transition-colors ${urgent ? 'text-brand-accent/90' : 'text-brand-gray/50'}`}>
                {isExpired ? 'Expiré' : countdown.active ? `${countdown.hours}h ${String(countdown.minutes).padStart(2, '0')}m ${String(countdown.seconds).padStart(2, '0')}s` : `${SCAN_WINDOW_MS[member.plan === 'premium' ? 'premium' : 'free'] / 3_600_000}h`}
              </span>
            </div>
            <div className="w-full h-px bg-brand-gray/10 relative overflow-hidden"
              role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={countdown.active ? countdown.percent : 100}
              aria-label="Temps restant de la fenêtre">
              <div className={`absolute left-0 top-0 h-full transition-all duration-1000 ${urgent ? 'bg-brand-accent/70' : 'bg-brand-white/20'}`}
                style={{ width: `${countdown.percent}%` }} />
            </div>
          </div>
        )}

        <Link href={preview ? `/profil/${member.id}` : isOwner ? '/dashboard' : '/'}
          className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-2"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          {preview ? '← quitter l’aperçu' : isOwner ? '← retour au dashboard' : '← retour'}
        </Link>
      </div>
    </main>
  );
}
