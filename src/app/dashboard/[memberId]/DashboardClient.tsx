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

function InboxSection({ messages: initialMessages, memberId }: { messages: Message[]; memberId: string }) {
  const [messages, setMessages]         = useState(initialMessages);
  const [reportingId,  setReportingId]  = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reported,     setReported]     = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(initialMessages.length >= 10);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/messages?memberId=${memberId}&offset=${messages.length}&limit=10`);
      const data = await res.json();
      if (data.messages?.length) {
        setMessages(prev => [...prev, ...data.messages]);
        if (data.messages.length < 10) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch {}
    setLoadingMore(false);
  };

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

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full py-3 border border-brand-gray/10 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/30 hover:border-brand-gray/25 hover:text-brand-gray/50 transition-colors rounded-[2px] mt-2 disabled:opacity-40">
          {loadingMore ? 'Chargement...' : 'Voir plus'}
        </button>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function PremiumBlock({ member }: { member: Member }) {
  const [loading, setLoading] = useState(false);
  const isPremium = member.plan === 'premium';

  const handleAction = async () => {
    setLoading(true);
    try {
      const endpoint = isPremium ? '/api/subscription/portal' : '/api/subscription/checkout';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // ignore
    }
    setLoading(false);
  };

  return (
    <div className={`w-full border rounded-[2px] p-4 flex flex-col gap-3 ${isPremium ? 'bg-[#0a0a08] border-[#C5A059]/20' : 'bg-[#080808] border-brand-gray/10'}`}>
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className={`font-ui text-xs tracking-[0.18em] uppercase ${isPremium ? 'text-[#C5A059]/60' : 'text-brand-gray/30'}`}>
          {isPremium ? '✦ premium actif' : 'premium'}
        </span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>

      {isPremium ? (
        <div className="flex flex-col gap-2">
          <p className="font-ui text-xs md:text-sm text-brand-gray/50 leading-relaxed">
            Vous bénéficiez de la fenêtre 48h, des conversations illimitées et du badge ✦ sur votre profil.
          </p>
          <button onClick={handleAction} disabled={loading}
            className="w-full py-2.5 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/40 hover:border-brand-gray/30 hover:text-brand-gray/60 transition-colors rounded-[2px] disabled:opacity-40">
            {loading ? 'Chargement...' : 'Gérer mon abonnement'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {[
              'Fenêtre scanner étendue à 48h (au lieu de 24h)',
              'Conversations illimitées (au lieu de 3)',
              'Badge ✦ visible sur votre profil',
              'Stats avancées à venir',
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="font-ui text-xs text-[#C5A059]/50 mt-0.5">✦</span>
                <span className="font-ui text-xs text-brand-gray/50">{item}</span>
              </div>
            ))}
          </div>
          <button onClick={handleAction} disabled={loading}
            className="animate-shimmer w-full py-3 bg-[#C5A059] text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-[#d4af6a] active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
            {loading ? 'Chargement...' : 'Passer premium — 2,99€/mois'}
          </button>
          <p className="font-ui text-xxs text-brand-gray/20 text-center">
            Sans engagement · Annulable à tout moment
          </p>
        </div>
      )}
    </div>
  );
}

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
        setPauseError(data.error || `Erreur ${res.status}`);
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

      {/* Premium */}
      <PremiumBlock member={member} />

      {/* Parrainage */}
      <ReferralBlock memberId={member.id} />

      {/* Modifier profil */}
      <Link href="/register?edit=1"
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

      {/* Feedback app */}
      <FeedbackBlock memberId={member.id} />

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
      <LogoutButton />

      {/* Suppression de compte */}
      <DeleteAccountButton />
    </div>
  );
}

function FeedbackBlock({ memberId }: { memberId: string }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'app', message: message.trim(), memberId }),
      });
      if (res.ok) {
        setSent(true);
        setMessage('');
      } else {
        setError('Erreur lors de l\u0027envoi.');
      }
    } catch {
      setError('Erreur r\u00e9seau.');
    }
    setSending(false);
  };

  return (
    <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">votre avis</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>

      {sent ? (
        <p className="font-ui text-xs text-green-400/60 text-center py-2">
          Merci pour votre retour. Il nous aide à améliorer l&apos;expérience.
        </p>
      ) : (
        <>
          <p className="font-ui text-xxs md:text-xs text-brand-gray/40 leading-relaxed">
            Bug, suggestion, impression — tout retour est précieux.
          </p>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setError(''); }}
            maxLength={2000}
            rows={3}
            placeholder="Votre message..."
            className="w-full bg-transparent border border-brand-gray/15 focus:border-brand-white/30 text-brand-white font-ui font-light text-sm p-3 outline-none transition-colors placeholder:text-brand-gray/15 rounded-[2px] resize-none"
          />
          {error && <p className="font-ui text-xs text-red-400">{error}</p>}
          <button onClick={handleSubmit} disabled={sending || !message.trim()}
            className="w-full py-2.5 bg-brand-white/10 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-white/60 hover:bg-brand-white/15 transition-colors rounded-[2px] disabled:opacity-30 disabled:cursor-not-allowed">
            {sending ? 'Envoi...' : 'Envoyer'}
          </button>
        </>
      )}
    </div>
  );
}

function LogoutButton() {
  const [confirming, setConfirming] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('just_logged_in');
    window.location.href = '/auth/login';
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full py-3 border border-red-500/20 text-center font-ui text-xs font-light tracking-[0.2em] uppercase text-red-400/60 hover:border-red-500/40 hover:text-red-400 transition-colors rounded-[2px]"
      >
        Se déconnecter
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => setConfirming(false)}
        className="flex-1 py-3 border border-brand-gray/20 text-center font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/50 hover:border-brand-gray/40 transition-colors rounded-[2px]">
        Annuler
      </button>
      <button onClick={handleLogout}
        className="flex-1 py-3 border border-red-500/40 text-center font-ui text-xs font-bold tracking-[0.15em] uppercase text-red-400 hover:bg-red-500/10 transition-colors rounded-[2px]">
        Confirmer
      </button>
    </div>
  );
}

function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/member/delete', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/';
      }
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="font-ui text-xxs text-brand-gray/20 tracking-[0.1em] underline underline-offset-4 hover:text-red-400/50 transition-colors py-2"
      >
        Supprimer mon compte
      </button>
    );
  }

  return (
    <div className="w-full bg-red-500/5 border border-red-500/20 rounded-[2px] p-4 flex flex-col gap-3">
      <p className="font-ui text-xs text-red-400/80 text-center leading-relaxed">
        Cette action est irréversible. Toutes vos données seront supprimées.
      </p>
      <div className="flex gap-2">
        <button onClick={() => setConfirming(false)}
          className="flex-1 py-2.5 border border-brand-gray/20 text-center font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/50 hover:border-brand-gray/40 transition-colors rounded-[2px]">
          Annuler
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="flex-1 py-2.5 bg-red-500/80 text-center font-ui text-xs font-bold tracking-[0.15em] uppercase text-white rounded-[2px] hover:bg-red-500 transition-colors disabled:opacity-50">
          {deleting ? 'Suppression...' : 'Confirmer'}
        </button>
      </div>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────

function ScanChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div className="w-full bg-[#080808] border border-[#C5A059]/15 rounded-[2px] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className="font-ui text-xs text-[#C5A059]/50 tracking-[0.18em] uppercase">✦ scans · 7 jours</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>
      <div className="flex items-end gap-1.5 h-16 w-full">
        {data.map(d => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative" style={{ height: '48px' }}>
              <div
                className="absolute bottom-0 w-full bg-[#C5A059]/30 rounded-t-[1px] transition-all duration-500"
                style={{ height: `${Math.max(2, (d.count / max) * 48)}px` }}
              />
            </div>
            <span className="font-ui text-[8px] text-brand-gray/25 tabular-nums">
              {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'narrow' })}
            </span>
          </div>
        ))}
      </div>
      <p className="font-ui text-xxs text-brand-gray/25 text-center">
        {data.reduce((s, d) => s + d.count, 0)} scans cette semaine
      </p>
    </div>
  );
}

function HomeSection({ member, recentScans, scansByDay = [] }: {
  member: Member;
  recentScans: Scan[];
  scansByDay?: { date: string; count: number }[];
}) {
  return (
    <>
      <StatsBlock member={member} recentScans={recentScans} />

      {/* Stats premium */}
      {member.plan === 'premium' && scansByDay.length > 0 && (
        <ScanChart data={scansByDay} />
      )}

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
            <p className="font-ui text-sm font-medium tracking-[0.2em]">
              {member.name.toUpperCase()}
              {member.plan === 'premium' && <span className="ml-1.5 text-[#C5A059]/70">✦</span>}
            </p>
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
  scansByDay = [],
}: {
  member:      Member;
  recentScans: Scan[];
  messages:    Message[];
  unreadCount: number;
  scansByDay?: { date: string; count: number }[];
}) {
  const [tab, setTab]     = useState<Tab>('home');
  const [toast, setToast] = useState('');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // Toast profil mis à jour
    const updated = sessionStorage.getItem('profile_updated');
    if (updated) {
      setToast('Profil mis à jour.');
      sessionStorage.removeItem('profile_updated');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    // Toast upgrade premium
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      setToast('✦ Bienvenue dans le cercle premium.');
      window.history.replaceState({}, '', '/dashboard');
      setTimeout(() => setToast(''), 4000);
      return;
    }

    // Toast connexion réussie
    const justLoggedIn = sessionStorage.getItem('just_logged_in');
    if (!justLoggedIn) {
      sessionStorage.setItem('just_logged_in', '1');
      setToast(`Bienvenue, ${member.name}.`);
      setTimeout(() => setToast(''), 3000);
    }
  }, [member.name]);

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
            <HomeSection member={member} recentScans={recentScans} scansByDay={scansByDay} />
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
