'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-browser';
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

const WAITING_PHRASES = [
  "Portez votre t-shirt et laissez le hasard faire.",
  "Votre profil est prêt. La prochaine rencontre commence dehors.",
  "Aucun scan encore. Sortez, portez, osez.",
];

function getWaitingPhrase(memberId: string): string {
  const seed = memberId.charCodeAt(0) + new Date().getDate();
  return WAITING_PHRASES[seed % WAITING_PHRASES.length];
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
          className={`flex-1 py-3 font-ui text-xs tracking-[0.2em] uppercase transition-colors relative ${
            active === tab.key ? 'text-brand-white border-b border-brand-white' : 'text-brand-gray/30 hover:text-brand-gray/60'
          }`}
        >
          {tab.label}
          {tab.badge && tab.badge > 0 ? (
            <span className="absolute top-2 right-[calc(50%-16px)] w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-xxs text-white font-bold">
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
        <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{getWaitingPhrase(member.id)}&rdquo;
        </p>
        <p className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">
          Membre depuis {days} jour{days > 1 ? 's' : ''}
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
            <span className="font-display text-3xl md:text-4xl font-light">{s.value}</span>
            <span className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">{s.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Inbox (Messages) ─────────────────────────────────────────────────────────

function InboxSection({ messages, memberId }: { messages: Message[]; memberId: string }) {
  const [reportingId,  setReportingId]  = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reported,     setReported]     = useState<Set<string>>(new Set());

  const handleReport = async (messageId: string) => {
    setReportingId(messageId);
    setConfirmingId(null);
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
        <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/40">Aucun message pour l&apos;instant.</p>
        <p className="font-ui text-xs md:text-sm text-brand-gray/25 leading-relaxed">
          Quand quelqu&apos;un scannera votre QR code et vous enverra un message, il apparaîtra ici.
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
                <p className={`font-ui text-sm leading-relaxed ${!msg.read_at ? 'text-brand-white/90' : 'text-brand-gray/60'}`}>
                  {msg.content}
                </p>
              </div>
              {!msg.read_at && (
                <span className="w-2 h-2 rounded-full bg-brand-white flex-shrink-0 mt-1" />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-ui text-xs text-brand-gray/30">
                  {msg.sender_contact || 'Anonyme'}
                </span>
                <span className="text-brand-gray/15">·</span>
                <span className="font-ui text-xs text-brand-gray/25">
                  {timeAgo(msg.created_at)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {msg.reply ? (
                  <span className="font-ui text-xxs text-brand-gray/30">Répondu</span>
                ) : (
                  <Link href={`/conversation/${msg.id}`}
                    className="font-ui text-xs text-brand-white/60 hover:text-brand-white transition-colors">
                    Répondre
                  </Link>
                )}
                <span className="text-brand-gray/10">|</span>
                {isReported ? (
                  <span className="font-ui text-xxs text-red-400/60">Signalé</span>
                ) : confirmingId === msg.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => handleReport(msg.id)} disabled={reportingId === msg.id}
                      className="font-ui text-xxs text-red-400 hover:text-red-300 transition-colors">
                      Confirmer
                    </button>
                    <button onClick={() => setConfirmingId(null)}
                      className="font-ui text-xxs text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(msg.id)}
                    className="font-ui text-xxs text-brand-gray/25 hover:text-red-400 transition-colors"
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
  const [count,     setCount]     = useState<number | null>(null);
  const [converted, setConverted] = useState<number>(0);
  const [copied,    setCopied]    = useState(false);
  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/shop?ref=${memberId}`
    : '';

  React.useEffect(() => {
    fetch(`/api/referral?memberId=${memberId}`)
      .then(r => r.json())
      .then(d => { setCount(d.count ?? 0); setConverted(d.converted ?? 0); })
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
        <span className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">parrainage</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>
      <p className="font-ui text-xs md:text-sm text-brand-gray/50 leading-relaxed">
        Partagez votre lien. Chaque parrainage est comptabilisé.
      </p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-brand-gray/40 break-all flex-1 leading-relaxed">{referralUrl}</p>
        <button onClick={handleCopy} className="font-ui text-xs text-brand-white/60 hover:text-brand-white transition-colors flex-shrink-0 px-2 py-1 border border-brand-gray/20 rounded-[2px]">
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          onClick={() => navigator.share({ title: 'In Real Society', text: 'Rejoins le club.', url: referralUrl }).catch(() => {})}
          className="w-full py-2.5 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/40 hover:border-brand-gray/30 hover:text-brand-gray/60 transition-colors rounded-[2px]"
        >
          Partager le lien
        </button>
      )}
      {count !== null && (
        <div className="flex items-center gap-4">
          <p className="font-ui text-xs text-brand-gray/30">
            {count} parrainage{count !== 1 ? 's' : ''}
          </p>
          {converted > 0 && (
            <p className="font-ui text-xs text-green-400/50">
              {converted} achat{converted !== 1 ? 's' : ''} confirmé{converted !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsSection({ member }: { member: Member }) {
  const [isPaused,    setIsPaused]    = useState(member.is_paused);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  const [pauseError, setPauseError] = useState('');

  const togglePause = async () => {
    setSaving(true);
    setPauseError('');
    try {
      const res = await fetch('/api/member/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paused: !isPaused }),
      });
      if (res.ok) {
        setIsPaused(!isPaused);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setPauseError(data.debug || data.error || `Erreur ${res.status}`);
      }
    } catch {
      setPauseError('Erreur réseau.');
    }
    setSaving(false);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Pause profil */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <span className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">visibilité</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-sm text-brand-white/80">Mettre en pause</p>
            <p className="font-ui text-xs text-brand-gray/40 leading-relaxed">
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
        {saved && <p className="font-ui text-xs text-green-400/60">Sauvegardé.</p>}
        {pauseError && <p className="font-ui text-xs text-red-400">{pauseError}</p>}
      </div>

      {/* Parrainage */}
      <ReferralBlock memberId={member.id} />

      {/* Modifier profil */}
      <Link href="/register"
        className="w-full py-3 border border-brand-gray/20 text-center font-ui text-sm font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors rounded-[2px]">
        Modifier mon profil
      </Link>

      {/* Infos */}
      <div className="flex flex-col gap-2">
        <p className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">Compte</p>
        <p className="font-ui text-xs md:text-sm text-brand-gray/50">{member.email || 'Pas d\'email associé'}</p>
        <p className="font-ui text-xs text-brand-gray/25">
          Membre depuis le {new Date(member.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Changer mot de passe */}
      <Link href="/auth/forgot-password"
        className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/40 hover:border-brand-gray/30 hover:text-brand-gray/60 transition-colors rounded-[2px]"
      >
        Changer mon mot de passe
      </Link>

      {/* Liens légaux */}
      <div className="flex flex-col gap-2 border-t border-brand-gray/10 pt-4">
        <Link href="/cgv" className="font-ui text-xs text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
          Conditions Générales de Vente
        </Link>
        <Link href="/manifeste" className="font-ui text-xs text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
          Manifeste
        </Link>
      </div>

      {/* Déconnexion */}
      <button
        onClick={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.href = '/auth/login';
        }}
        className="w-full py-3 border border-red-500/20 text-center font-ui text-xs font-light tracking-[0.2em] uppercase text-red-400/60 hover:border-red-500/40 hover:text-red-400 transition-colors rounded-[2px]"
      >
        Se déconnecter
      </button>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────

function HomeSection({ member, recentScans }: {
  member: Member;
  recentScans: Scan[];
}) {
  return (
    <>
      <StatsBlock member={member} recentScans={recentScans} />

      <div className="w-full h-px bg-brand-gray/10" />

      {/* Profil card */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <span className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">votre profil</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-[-4px] rounded-full border border-brand-white/5" />
            <div className="w-full h-full rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
              {member.photo_url ? (
                <Image src={member.photo_url} alt={`Photo de ${member.name}`} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-base font-light text-brand-gray/50">{getInitials(member.name)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-sm font-medium tracking-[0.2em]">{member.name.toUpperCase()}</p>
            <p className="font-ui text-xs text-brand-gray/40">
              {member.is_paused
                ? 'En pause'
                : member.scan_count > 0
                  ? `Actif · ${member.scan_count} scan${member.scan_count > 1 ? 's' : ''}`
                  : 'Profil actif · En attente du premier scan'}
            </p>
          </div>
        </div>
        <p className="font-display text-lg font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{member.pitch}&rdquo;
        </p>
      </div>

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          <p className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">Derniers scans</p>
          {recentScans.map(scan => (
            <div key={scan.id} className="flex items-center justify-between py-2 border-b border-brand-gray/10">
              <span className="font-ui text-sm font-light text-brand-white/70">{scan.scanner_name || 'Anonyme'}</span>
              <span className="font-ui text-xs text-brand-gray/40">{formatDate(scan.scanned_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lien profil */}
      <div className="w-full flex flex-col gap-3">
        <Link href={`/profil/${member.id}`}
          className="w-full py-3 border border-brand-gray/20 text-center font-ui text-sm font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors">
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
  const [tab, setTab]     = useState<Tab>('home');
  const [toast, setToast] = useState('');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const updated = sessionStorage.getItem('profile_updated');
    if (updated) {
      setToast('Profil mis à jour.');
      sessionStorage.removeItem('profile_updated');
      setTimeout(() => setToast(''), 3000);
    }
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-brand-black text-brand-white px-6 py-8 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 z-50 px-4 py-2 bg-brand-white/10 border border-brand-white/20 rounded-[2px] backdrop-blur-sm animate-stagger-1">
          <p className="font-ui text-sm text-brand-white/80">{toast}</p>
        </div>
      )}

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-6">

        {/* Header */}
        <div className="text-center flex flex-col gap-2">
          <h2 className="font-display text-3xl font-light tracking-[0.06em]">
            Bienvenue<br /><span className="font-semibold">{member.name}.</span>
          </h2>
          <p className="font-ui text-sm font-light text-brand-gray/50 tracking-[0.1em]">
            {member.is_paused
              ? 'Profil en pause.'
              : member.scan_count > 0
                ? 'Votre vêtement est actif.'
                : 'Votre profil est prêt. Portez votre t-shirt.'}
          </p>
        </div>

        {/* Tabs */}
        <TabBar active={tab} onChange={setTab} unreadCount={unreadCount} />

        {/* Tab content with transition */}
        <div className="w-full animate-stagger-1" key={tab}>
          {tab === 'home' && (
            <HomeSection member={member} recentScans={recentScans} />
          )}

          {tab === 'inbox' && (
            <InboxSection messages={messages} memberId={member.id} />
          )}

          {tab === 'settings' && (
            <SettingsSection member={member} />
          )}
        </div>

      </div>
    </main>
  );
}
