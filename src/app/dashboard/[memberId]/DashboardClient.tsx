'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Member, Scan } from '@/lib/types';

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function daysActive(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const EMPTY_PHRASES = [
  "Le bon moment n'est pas encore arrivé.",
  "En mouvement.",
  "Le destin prend son temps.",
  "Quelqu'un marche vers vous en ce moment.",
  "L'évidence se prépare.",
  "Chaque intersection a sa propre horloge.",
];

function getEmptyPhrase(memberId: string): string {
  const seed = memberId.charCodeAt(0) + new Date().getDate();
  return EMPTY_PHRASES[seed % EMPTY_PHRASES.length];
}

function StatsBlock({ member }: { member: Member }) {
  const days   = daysActive(member.created_at);
  const noScan = member.scan_count === 0;

  if (noScan) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center animate-stagger-2">
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
        <p className="font-display text-[1rem] font-light italic text-brand-gray/50 leading-relaxed">
          "{getEmptyPhrase(member.id)}"
        </p>
        <p className="font-ui text-[0.52rem] text-brand-gray/25 tracking-[0.15em] uppercase">
          {days} jour{days > 1 ? 's' : ''} en circulation
        </p>
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 w-full justify-center animate-stagger-2">
      {[
        { value: member.scan_count.toString(), label: 'Scans' },
        { value: '0',                          label: 'Récents' },
        { value: days.toString(),              label: 'Jours' },
      ].map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <div className="w-px h-8 bg-brand-gray/10" />}
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-[2rem] font-light">{s.value}</span>
            <span className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">{s.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Bannière migration pour les membres legacy ───────────────────────────────

function MigrationBanner({ memberId }: { memberId: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="w-full border border-brand-white/20 bg-brand-white/5 rounded-[2px] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-ui text-[0.55rem] font-bold tracking-[0.15em] uppercase text-brand-white/80">
            Sécurisez votre profil
          </p>
          <p className="font-ui text-[0.5rem] text-brand-gray/50 leading-relaxed">
            Créez un mot de passe pour protéger votre compte. Votre profil reste accessible pendant la migration.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-brand-gray/30 hover:text-brand-gray/60 transition-colors text-[0.8rem] flex-shrink-0 mt-0.5"
        >
          ×
        </button>
      </div>
      <a
        href={`/migrate?memberId=${memberId}`}
        className="w-full py-2.5 bg-brand-white text-brand-black font-ui font-bold text-[0.55rem] tracking-[0.2em] uppercase text-center rounded-[1px] hover:bg-gray-100 transition-colors"
      >
        Créer mon mot de passe →
      </a>
    </div>
  );
}

export default function DashboardClient({
  member,
  recentScans,
}: {
  member:      Member;
  recentScans: Scan[];
}) {
  const [loadingQr,       setLoadingQr]       = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error,           setError]           = useState('');
  const [cgvAccepted,     setCgvAccepted]     = useState(false);

  const appUrl     = typeof window !== 'undefined' ? window.location.origin : '';
  const profileUrl = `${appUrl}/?id=${member.id}`;
  const isLegacy   = !member.auth_user_id;

  const handleGenerateAndBuy = async () => {
    setError('');
    setLoadingQr(true);

    try {
      const qrRes = await fetch('/api/qrcode', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memberId: member.id }),
      });

      if (!qrRes.ok) throw new Error('Erreur génération QR code.');
      const { qrCodeUrl } = await qrRes.json() as { qrCodeUrl: string };

      setLoadingQr(false);
      setLoadingCheckout(true);

      const checkoutRes = await fetch('/api/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: member.id, qrCodeUrl }),
      });

      if (!checkoutRes.ok) throw new Error('Erreur création session Stripe.');
      const { url: checkoutUrl } = await checkoutRes.json() as { url: string };

      window.location.href = checkoutUrl;

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
      setLoadingQr(false);
      setLoadingCheckout(false);
    }
  };

  const isLoading    = loadingQr || loadingCheckout;
  const loadingLabel = loadingQr ? 'Génération du QR code...' : 'Redirection vers le paiement...';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">

      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-8">

        {/* Bannière migration — uniquement pour les membres legacy */}
        {isLegacy && <MigrationBanner memberId={member.id} />}

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Bienvenue<br />
            <span className="font-semibold">{member.name}.</span>
          </h2>
          <p className="font-ui text-[0.6rem] font-light text-brand-gray/50 tracking-[0.1em]">
            {member.scan_count > 0 ? 'Votre vêtement est actif.' : 'Configurez votre T-shirt.'}
          </p>
        </div>

        <StatsBlock member={member} />

        <div className="w-full h-px bg-brand-gray/10 animate-line-draw" />

        <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4 animate-stagger-3">
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" />
            <span className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">votre profil</span>
            <div className="flex-1 h-px bg-brand-gray/10" />
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex-shrink-0">
              <div className="absolute inset-[-4px] rounded-full border border-brand-white/5 animate-ring-pulse" />
              <div className="w-full h-full rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center">
                <span className="font-display text-[0.9rem] font-light text-brand-gray/50">
                  {getInitials(member.name)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="font-ui text-[0.62rem] font-medium tracking-[0.2em]">{member.name.toUpperCase()}</p>
              <p className="font-ui text-[0.52rem] text-brand-gray/40">
                {member.scan_count > 0 ? `Actif · ${member.scan_count} scan${member.scan_count > 1 ? 's' : ''}` : 'En attente de commande'}
              </p>
            </div>
          </div>
          <p className="font-display text-[0.88rem] font-light italic text-brand-gray/50 leading-relaxed">
            "{member.pitch}"
          </p>
        </div>

        {recentScans.length > 0 && (
          <div className="w-full flex flex-col gap-2 animate-stagger-3">
            <p className="font-ui text-[0.5rem] text-brand-gray/30 tracking-[0.2em] uppercase">Derniers scans</p>
            {recentScans.map(scan => (
              <div key={scan.id} className="flex items-center justify-between py-2 border-b border-brand-gray/10">
                <span className="font-ui text-[0.62rem] font-light text-brand-white/70">
                  {scan.scanner_name || 'Anonyme'}
                </span>
                <span className="font-ui text-[0.52rem] text-brand-gray/40">
                  {formatDate(scan.scanned_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-3 animate-stagger-4">
          <p className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase mb-1">URL de votre QR code</p>
          <p className="font-mono text-[0.6rem] text-brand-gray/60 break-all leading-relaxed">{profileUrl}</p>
        </div>

        {error && <p className="font-ui text-[0.58rem] text-red-400 text-center w-full">{error}</p>}

        <div className="w-full flex flex-col gap-3 animate-stagger-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <div
              onClick={() => setCgvAccepted(v => !v)}
              className={`mt-0.5 w-4 h-4 flex-shrink-0 border rounded-[2px] flex items-center justify-center transition-all ${cgvAccepted ? 'bg-brand-white border-brand-white' : 'border-brand-gray/30 hover:border-brand-white/50'}`}
            >
              {cgvAccepted && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 4L3 6L7 2" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="font-ui text-[0.58rem] font-light text-brand-gray/50 leading-relaxed">
              J'ai lu et j'accepte les{' '}
              <a href="/cgv" target="_blank" className="text-brand-white/70 underline underline-offset-2 hover:text-brand-white transition-colors">
                Conditions Générales de Vente
              </a>
              , notamment l'absence de droit de rétractation pour les produits personnalisés.
            </span>
          </label>

          <button
            onClick={handleGenerateAndBuy}
            disabled={isLoading || !cgvAccepted}
            className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? loadingLabel : 'Commander mon T-shirt'}
          </button>

          <Link href={`/profil/${member.id}`}
            className="w-full py-3 border border-brand-gray/20 text-center font-ui text-[0.58rem] font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors">
            Voir mon profil
          </Link>

          <Link href="/register"
            className="font-ui text-[0.55rem] text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors text-center">
            Modifier mon profil
          </Link>
        </div>

      </div>
    </main>
  );
}