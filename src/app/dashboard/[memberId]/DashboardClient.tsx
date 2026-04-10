'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Member, Scan, Message } from '@/lib/types';

// ─── Utilitaires ──────────────────────────────────────────────────────────────

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

function recentScansCount(scans: Scan[]): number {
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  return scans.filter(s => new Date(s.scanned_at).getTime() > sevenDaysAgo).length;
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

// ─── Navigation par onglets ───────────────────────────────────────────────────

type Tab = 'home' | 'inbox' | 'settings';

function TabBar({ active, onChange, unreadCount }: {
  active: Tab;
  onChange: (tab: Tab) => void;
  unreadCount: number;
}) {
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'home',     label: 'Accueil' },
    { key: 'inbox',    label: 'Messages', badge: unreadCount },
    { key: 'settings', label: 'Réglages' },
  ];

  return (
    <div className="w-full flex border-b border-brand-gray/10 mb-2">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-3 font-ui text-[0.52rem] tracking-[0.2em] uppercase transition-colors relative ${
            active === tab.key ? 'text-brand-white border-b border-brand-white' : 'text-brand-gray/30 hover:text-brand-gray/60'
          }`}
        >
          {tab.label}
          {tab.badge && tab.badge > 0 ? (
            <span className="absolute top-2 right-[calc(50%-16px)] w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[0.4rem] text-white font-bold">
              {tab.badge > 9 ? '9+' : tab.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ─── Stats Block ──────────────────────────────────────────────────────────────

function StatsBlock({ member, recentScans }: { member: Member; recentScans: Scan[] }) {
  const days   = daysActive(member.created_at);
  const noScan = member.scan_count === 0;

  if (noScan) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
        <p className="font-display text-[1rem] font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{getEmptyPhrase(member.id)}&rdquo;
        </p>
        <p className="font-ui text-[0.52rem] text-brand-gray/25 tracking-[0.15em] uppercase">
          {days} jour{days > 1 ? 's' : ''} en circulation
        </p>
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 w-full justify-center">
      {[
        { value: member.scan_count.toString(),                  label: 'Scans' },
        { value: recentScansCount(recentScans).toString(),      label: '7 jours' },
        { value: days.toString(),                               label: 'Jours' },
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

// ─── Migration Banner ─────────────────────────────────────────────────────────

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
            Créez un mot de passe pour protéger votre compte.
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-brand-gray/30 hover:text-brand-gray/60 transition-colors text-[0.8rem] flex-shrink-0 mt-0.5">×</button>
      </div>
      <a href={`/migrate?memberId=${memberId}`}
        className="w-full py-2.5 bg-brand-white text-brand-black font-ui font-bold text-[0.55rem] tracking-[0.2em] uppercase text-center rounded-[1px] hover:bg-gray-100 transition-colors">
        Créer mon mot de passe →
      </a>
    </div>
  );
}

// ─── Inbox (Messages) ─────────────────────────────────────────────────────────

function InboxSection({ messages, memberId }: { messages: Message[]; memberId: string }) {
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reported,    setReported]    = useState<Set<string>>(new Set());

  const handleReport = async (messageId: string) => {
    setReportingId(messageId);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, memberId }),
      });
      if (res.ok) {
        setReported(prev => new Set(prev).add(messageId));
      }
    } catch {}
    setReportingId(null);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="font-display text-[1rem] font-light italic text-brand-gray/40">Aucun message pour l'instant.</p>
        <p className="font-ui text-[0.52rem] text-brand-gray/25 leading-relaxed">
          Quand quelqu'un scannera votre QR code et vous enverra un message, il apparaîtra ici.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-1">
      {messages.map(msg => {
        const isReported = reported.has(msg.id);
        return (
          <div key={msg.id} className={`w-full bg-[#080808] border rounded-[2px] p-3 flex flex-col gap-2 ${!msg.read_at ? 'border-brand-white/20' : 'border-brand-gray/10'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className={`font-ui text-[0.62rem] leading-relaxed ${!msg.read_at ? 'text-brand-white/90' : 'text-brand-gray/60'}`}>
                  {msg.content}
                </p>
              </div>
              {!msg.read_at && (
                <span className="w-2 h-2 rounded-full bg-brand-white flex-shrink-0 mt-1" />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-ui text-[0.45rem] text-brand-gray/30">
                  {msg.sender_contact || 'Anonyme'}
                </span>
                <span className="text-brand-gray/15">·</span>
                <span className="font-ui text-[0.45rem] text-brand-gray/25">
                  {timeAgo(msg.created_at)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {msg.reply ? (
                  <span className="font-ui text-[0.42rem] text-brand-gray/30">Répondu</span>
                ) : (
                  <Link href={`/conversation/${msg.id}`}
                    className="font-ui text-[0.45rem] text-brand-white/60 hover:text-brand-white transition-colors">
                    Répondre
                  </Link>
                )}
                <span className="text-brand-gray/10">|</span>
                {isReported ? (
                  <span className="font-ui text-[0.42rem] text-red-400/60">Signalé</span>
                ) : (
                  <button
                    onClick={() => handleReport(msg.id)}
                    disabled={reportingId === msg.id}
                    className="font-ui text-[0.42rem] text-brand-gray/25 hover:text-red-400 transition-colors"
                  >
                    Signaler
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function ReferralBlock({ memberId }: { memberId: string }) {
  const [count,  setCount]  = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/shop?ref=${memberId}`
    : '';

  React.useEffect(() => {
    fetch(`/api/referral?memberId=${memberId}`)
      .then(r => r.json())
      .then(d => setCount(d.count ?? 0))
      .catch(() => {});
  }, [memberId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">parrainage</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>
      <p className="font-ui text-[0.52rem] text-brand-gray/50 leading-relaxed">
        Partagez votre lien. Chaque parrainage est comptabilisé.
      </p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-[0.52rem] text-brand-gray/40 break-all flex-1 leading-relaxed">{referralUrl}</p>
        <button onClick={handleCopy} className="font-ui text-[0.48rem] text-brand-white/60 hover:text-brand-white transition-colors flex-shrink-0 px-2 py-1 border border-brand-gray/20 rounded-[2px]">
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      {count !== null && (
        <p className="font-ui text-[0.48rem] text-brand-gray/30">
          {count} parrainage{count !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

function SettingsSection({ member }: { member: Member }) {
  const [isPaused,    setIsPaused]    = useState(member.is_paused);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  const togglePause = async () => {
    setSaving(true);
    const res = await fetch('/api/member/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_paused: !isPaused }),
    });
    if (res.ok) {
      setIsPaused(!isPaused);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Pause profil */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <span className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">visibilité</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-[0.58rem] text-brand-white/80">Mettre en pause</p>
            <p className="font-ui text-[0.48rem] text-brand-gray/40 leading-relaxed">
              Votre profil sera masqué. Les scanneurs verront &ldquo;Ce membre est indisponible&rdquo;.
            </p>
          </div>
          <button
            onClick={togglePause}
            disabled={saving}
            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${isPaused ? 'bg-red-500/80' : 'bg-brand-gray/20'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPaused ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {saved && <p className="font-ui text-[0.45rem] text-green-400/60">Sauvegardé.</p>}
      </div>

      {/* Parrainage */}
      <ReferralBlock memberId={member.id} />

      {/* Modifier profil */}
      <Link href="/register"
        className="w-full py-3 border border-brand-gray/20 text-center font-ui text-[0.55rem] font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors rounded-[2px]">
        Modifier mon profil
      </Link>

      {/* Infos */}
      <div className="flex flex-col gap-2">
        <p className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">Compte</p>
        <p className="font-ui text-[0.52rem] text-brand-gray/50">{member.email || 'Pas d\'email associé'}</p>
        <p className="font-ui text-[0.48rem] text-brand-gray/25">
          Membre depuis le {new Date(member.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Liens légaux */}
      <div className="flex flex-col gap-2 border-t border-brand-gray/10 pt-4">
        <Link href="/cgv" className="font-ui text-[0.48rem] text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
          Conditions Générales de Vente
        </Link>
        <Link href="/manifeste" className="font-ui text-[0.48rem] text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
          Manifeste
        </Link>
      </div>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────

function HomeSection({ member, recentScans, onBuy, isLoading, loadingLabel, error, cgvAccepted, setCgvAccepted }: {
  member: Member;
  recentScans: Scan[];
  onBuy: () => void;
  isLoading: boolean;
  loadingLabel: string;
  error: string;
  cgvAccepted: boolean;
  setCgvAccepted: (v: boolean) => void;
}) {
  const appUrl     = typeof window !== 'undefined' ? window.location.origin : '';
  const profileUrl = `${appUrl}/profil/${member.id}`;

  return (
    <>
      <StatsBlock member={member} recentScans={recentScans} />

      <div className="w-full h-px bg-brand-gray/10" />

      {/* Profil card */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <span className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">votre profil</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-[-4px] rounded-full border border-brand-white/5" />
            <div className="w-full h-full rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
              {member.photo_url ? (
                <img src={`${member.photo_url}?width=80&quality=80`} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-[0.9rem] font-light text-brand-gray/50">{getInitials(member.name)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-[0.62rem] font-medium tracking-[0.2em]">{member.name.toUpperCase()}</p>
            <p className="font-ui text-[0.52rem] text-brand-gray/40">
              {member.is_paused ? 'En pause' : member.scan_count > 0 ? `Actif · ${member.scan_count} scan${member.scan_count > 1 ? 's' : ''}` : 'En attente de commande'}
            </p>
          </div>
        </div>
        <p className="font-display text-[0.88rem] font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{member.pitch}&rdquo;
        </p>
      </div>

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          <p className="font-ui text-[0.5rem] text-brand-gray/30 tracking-[0.2em] uppercase">Derniers scans</p>
          {recentScans.map(scan => (
            <div key={scan.id} className="flex items-center justify-between py-2 border-b border-brand-gray/10">
              <span className="font-ui text-[0.62rem] font-light text-brand-white/70">{scan.scanner_name || 'Anonyme'}</span>
              <span className="font-ui text-[0.52rem] text-brand-gray/40">{formatDate(scan.scanned_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* QR URL */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-3">
        <p className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase mb-1">URL de votre profil</p>
        <p className="font-mono text-[0.6rem] text-brand-gray/60 break-all leading-relaxed">{profileUrl}</p>
      </div>

      {error && <p className="font-ui text-[0.58rem] text-red-400 text-center w-full">{error}</p>}

      {/* Actions */}
      <div className="w-full flex flex-col gap-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            onClick={() => setCgvAccepted(!cgvAccepted)}
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
            <a href="/cgv" target="_blank" className="text-brand-white/70 underline underline-offset-2 hover:text-brand-white transition-colors">CGV</a>
            , notamment l'absence de droit de rétractation pour les produits personnalisés.
          </span>
        </label>

        <button
          onClick={onBuy}
          disabled={isLoading || !cgvAccepted}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? loadingLabel : 'Commander mon T-shirt'}
        </button>

        <Link href={`/profil/${member.id}`}
          className="w-full py-3 border border-brand-gray/20 text-center font-ui text-[0.58rem] font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors">
          Voir mon profil
        </Link>
      </div>
    </>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DashboardClient({
  member,
  recentScans,
  messages,
  unreadCount,
}: {
  member:      Member;
  recentScans: Scan[];
  messages:    Message[];
  unreadCount: number;
}) {
  const [tab,             setTab]             = useState<Tab>('home');
  const [loadingQr,       setLoadingQr]       = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error,           setError]           = useState('');
  const [cgvAccepted,     setCgvAccepted]     = useState(false);
  const [tshirtColor,     setTshirtColor]     = useState<'dark' | 'light'>('dark');

  const isLegacy = !member.auth_user_id;

  const handleGenerateAndBuy = async () => {
    setError('');
    setLoadingQr(true);

    try {
      const qrRes = await fetch('/api/qrcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id }),
      });
      if (!qrRes.ok) throw new Error('Erreur génération QR code.');
      const { qrCodeUrl } = await qrRes.json() as { qrCodeUrl: string };

      setLoadingQr(false);
      setLoadingCheckout(true);

      const checkoutRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, qrCodeUrl, tshirtColor }),
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
    <main className="relative flex min-h-screen flex-col items-center bg-brand-black text-brand-white px-6 py-8 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-6">

        {isLegacy && <MigrationBanner memberId={member.id} />}

        {/* Header */}
        <div className="text-center flex flex-col gap-2">
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Bienvenue<br /><span className="font-semibold">{member.name}.</span>
          </h2>
          <p className="font-ui text-[0.6rem] font-light text-brand-gray/50 tracking-[0.1em]">
            {member.is_paused ? 'Profil en pause.' : member.scan_count > 0 ? 'Votre vêtement est actif.' : 'Configurez votre T-shirt.'}
          </p>
        </div>

        {/* Tabs */}
        <TabBar active={tab} onChange={setTab} unreadCount={unreadCount} />

        {/* Sélecteur couleur — visible uniquement sur l'onglet home */}
        {tab === 'home' && (
          <div className="w-full flex flex-col gap-2">
            <p className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.18em] uppercase">Couleur du t-shirt</p>
            <div className="flex gap-3">
              {([
                { value: 'dark'  as const, label: 'Noir',  bg: '#0a0a0a', border: '#fff' },
                { value: 'light' as const, label: 'Blanc', bg: '#f5f5f5', border: '#333' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTshirtColor(opt.value)}
                  className={`flex-1 py-3 rounded-[2px] border transition-all flex items-center justify-center gap-2 ${
                    tshirtColor === opt.value
                      ? 'border-brand-white/60 bg-brand-white/5'
                      : 'border-brand-gray/15 hover:border-brand-gray/30'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full border border-brand-gray/30" style={{ background: opt.bg }} />
                  <span className="font-ui text-[0.52rem] tracking-[0.15em] uppercase">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab content */}
        {tab === 'home' && (
          <HomeSection
            member={member}
            recentScans={recentScans}
            onBuy={handleGenerateAndBuy}
            isLoading={isLoading}
            loadingLabel={loadingLabel}
            error={error}
            cgvAccepted={cgvAccepted}
            setCgvAccepted={setCgvAccepted}
          />
        )}

        {tab === 'inbox' && (
          <InboxSection messages={messages} memberId={member.id} />
        )}

        {tab === 'settings' && (
          <SettingsSection member={member} />
        )}

      </div>
    </main>
  );
}
