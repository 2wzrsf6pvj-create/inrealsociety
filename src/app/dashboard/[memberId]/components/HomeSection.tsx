'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Member, Scan, Message } from '@/lib/types';
import { daysActive, formatDate, getInitials, getWaitingPhrase, timeAgo } from './utils';
import { useCountUp } from './hooks';
import { captureEvent } from '@/lib/posthog-client';
import SectionDivider from '@/app/components/ui/SectionDivider';

// ─── #1 Conversations en attente — la VRAIE valeur, remontée tout en haut ──────
// Messages reçus auxquels le porteur n'a pas encore répondu (pas de reply, pas
// bloqués). Triés du plus ancien au plus récent (qui attend depuis le plus
// longtemps en premier). C'est l'action prioritaire du dashboard.

function PendingConversations({ messages }: { messages: Message[] }) {
  const pending = messages
    .filter(m => !m.reply && !m.blocked_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (pending.length === 0) return null;
  const shown = pending.slice(0, 3);
  const extra = pending.length - shown.length;

  return (
    <div className="w-full bg-[#0c0c0c] border border-brand-white/15 rounded-[2px] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-ui text-xs text-brand-white/80 tracking-[0.18em] uppercase">En attente de vous</p>
        <span className="font-ui text-xxs text-brand-gray/50 tabular-nums">{pending.length}</span>
      </div>
      {shown.map(m => (
        <Link key={m.id} href={`/conversation/${m.id}`} className="flex items-center gap-3 group">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-ui text-sm text-brand-white/80 truncate group-hover:text-brand-white transition-colors">{m.content}</p>
            {/* suppressHydrationWarning : timeAgo dépend de Date.now() (SSR ≠ client). */}
            <p suppressHydrationWarning className="font-ui text-xxs text-brand-gray/50">{m.sender_contact || 'Anonyme'} · {timeAgo(m.created_at)}</p>
          </div>
          <span className="font-ui text-xs text-brand-gray/50 group-hover:text-brand-white transition-colors flex-shrink-0">Répondre →</span>
        </Link>
      ))}
      {extra > 0 && (
        <p className="font-ui text-xxs text-brand-gray/50">+{extra} autre{extra > 1 ? 's' : ''} dans Messages</p>
      )}
    </div>
  );
}

// ─── #2 Nudge photo persistant ────────────────────────────────────────────────
// La photo est ce que voient les scanneurs. Au cold-start le guide la couvre ;
// ici on rappelle le porteur ACTIF sans photo (sinon le manque persiste pour
// toujours sans incitation).

function PhotoNudge() {
  return (
    <Link href="/register?edit=1"
      className="w-full bg-[#0a0a08] border border-[#C5A059]/25 rounded-[2px] p-3 flex items-center gap-3 hover:border-[#C5A059]/50 transition-colors">
      <span className="font-ui text-base text-[#C5A059]/70 leading-none">◎</span>
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="font-ui text-xs tracking-[0.12em] uppercase text-[#C5A059]/80">Ajoutez une photo</span>
        <span className="font-ui text-xxs text-brand-gray/50">C&apos;est la première chose que voient les scanneurs.</span>
      </div>
      <span className="font-ui text-xxs text-[#C5A059]/60 tracking-[0.15em] uppercase flex-shrink-0">Ajouter →</span>
    </Link>
  );
}

// ─── #6 Activer les notifications (niveau membre) ──────────────────────────────
// La réactivité du porteur fait la qualité du produit. Se masque si déjà
// accordées / refusées / non supportées (pas de nag). No-op silencieux sans
// VAPID (dev) ou service worker.

function NotificationsPrompt({ memberId }: { memberId: string }) {
  const [state, setState] = React.useState<'hidden' | 'idle' | 'loading'>('hidden');

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- permission connue du navigateur seulement
    if (Notification.permission === 'default') setState('idle');
  }, []);

  const enable = async () => {
    setState('loading');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('hidden'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) { setState('hidden'); return; }
      const pad = '='.repeat((4 - vapid.length % 4) % 4);
      const b64 = (vapid + pad).replace(/-/g, '+').replace(/_/g, '/');
      const raw = window.atob(b64);
      const key = Uint8Array.from(Array.from(raw), c => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }, memberId }),
      });
    } catch (err) {
      console.warn('[notifs] activation échouée:', err);
    }
    setState('hidden');
  };

  if (state === 'hidden') return null;

  return (
    <button onClick={enable} disabled={state === 'loading'}
      className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.1em] text-brand-gray/60 hover:border-brand-gray/35 hover:text-brand-white/80 transition-colors rounded-[2px] disabled:opacity-40"
      style={{ minHeight: '44px' }}>
      {state === 'loading' ? 'Activation...' : 'Être prévenu·e quand on m’écrit'}
    </button>
  );
}

// ─── Guide d'activation (cold-start) ───────────────────────────────────────────

function StepDot({ done }: { done: boolean }) {
  return done ? (
    <span className="animate-success w-5 h-5 rounded-full border border-green-400/40 flex items-center justify-center text-green-400/70 text-[10px] flex-shrink-0">✓</span>
  ) : (
    <span className="w-5 h-5 rounded-full border border-brand-gray/25 flex-shrink-0" />
  );
}

function ActivationGuide({ member }: { member: Member }) {
  // Photo = vrai signal de complétude côté scanneur. Instagram est optionnel à
  // l'inscription → on ne le rend pas bloquant (sinon nag permanent).
  const profileComplete = !!member.photo_url;

  React.useEffect(() => {
    captureEvent('activation_guide_viewed', { member_id: member.id });
  }, [member.id]);

  return (
    <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4">
      <SectionDivider label="préparez votre arrivée" />
      <p className="font-ui text-xs text-brand-gray/50 leading-relaxed">
        Le premier scan est le plus dur. Trois étapes pour y être prêt·e.
      </p>

      {/* 1 — Profil complet */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StepDot done={profileComplete} />
          <span className="font-ui text-sm text-brand-white/70">Complétez votre profil</span>
        </div>
        {!profileComplete && (
          <Link href="/register?edit=1" className="font-ui text-xs text-brand-white/60 hover:text-brand-white transition-colors flex-shrink-0">
            Compléter
          </Link>
        )}
      </div>

      {/* 2 — Aperçu */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059]/70 text-[10px] flex-shrink-0">✦</span>
          <span className="font-ui text-sm text-brand-white/70">Vivez votre premier scan</span>
        </div>
        <Link href={`/profil/${member.id}?preview=1`} className="font-ui text-xs text-brand-white/60 hover:text-brand-white transition-colors flex-shrink-0">
          Aperçu →
        </Link>
      </div>

      {/* 3 — IRL */}
      <div className="flex items-center gap-3">
        <StepDot done={false} />
        <div className="flex flex-col gap-0.5">
          <span className="font-ui text-sm text-brand-white/70">Portez-le. Sortez.</span>
          <span className="font-ui text-xxs text-brand-gray/55">C&apos;est là que tout se joue.</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Block ──────────────────────────────────────────────────────────────

function StatNumber({ value, label }: { value: number; label: string }) {
  const display = useCountUp(value);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-display text-3xl md:text-4xl font-light tabular-nums">{display}</span>
      <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.12em] uppercase text-center leading-tight">{label}</span>
    </div>
  );
}

function StatsBlock({ member, weekScans, conversations }: { member: Member; weekScans: number; conversations: number }) {
  const days   = daysActive(member.created_at);
  const noScan = member.scan_count === 0;

  if (noScan) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
        <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{getWaitingPhrase(member.id)}&rdquo;
        </p>
        <p className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase">
          Membre depuis {days} jour{days > 1 ? 's' : ''}
        </p>
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
      </div>
    );
  }

  // Valeur d'abord (conversations = rencontres réelles, hors bloquées), scans
  // ensuite (portée).
  const stats = [
    { value: conversations,                 label: 'Conversations' },
    { value: member.scan_count,             label: 'Scans' },
    { value: weekScans,                     label: '7 jours' },
  ];

  return (
    <div className="flex items-stretch gap-4 w-full justify-center">
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <div className="w-px self-center h-8 bg-brand-gray/10" />}
          <StatNumber value={s.value} label={s.label} />
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Scan chart (premium only) ────────────────────────────────────────────────

function ScanChart({ data }: { data: { date: string; count: number }[] }) {
  const max   = Math.max(1, ...data.map(d => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  // #3 insight IRL : le jour où le porteur est le plus remarqué → quand sortir.
  const peak  = data.reduce((best, d) => (d.count > best.count ? d : best), data[0]);
  const peakDay = peak && peak.count > 0
    ? new Date(peak.date).toLocaleDateString('fr-FR', { weekday: 'long' })
    : null;

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
            <span className="font-ui text-[8px] text-brand-gray/55 tabular-nums">
              {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'narrow' })}
            </span>
          </div>
        ))}
      </div>
      <p className="font-ui text-xxs text-brand-gray/55 text-center">
        {total} scans cette semaine{peakDay ? ` · pic le ${peakDay}` : ''}
      </p>
    </div>
  );
}

// ─── Home Section (orchestrator du tab Accueil) ──────────────────────────────

export default function HomeSection({ member, recentScans, scansByDay = [], weekScans = 0, messages = [], activeConversations = 0 }: {
  member: Member;
  recentScans: Scan[];
  scansByDay?: { date: string; count: number }[];
  messages?: Message[];
  activeConversations?: number;
  weekScans?: number;
}) {
  return (
    <>
      {/* #1 — Conversations en attente : action prioritaire, tout en haut */}
      <PendingConversations messages={messages} />

      {/* #2 — Nudge photo pour membre actif sans photo (cold-start couvert par le guide) */}
      {!member.photo_url && member.scan_count > 0 && <PhotoNudge />}

      <StatsBlock member={member} weekScans={weekScans} conversations={activeConversations} />

      {/* Stats premium */}
      {member.plan === 'premium' && scansByDay.length > 0 && (
        <ScanChart data={scansByDay} />
      )}

      {/* Guide d'activation tant qu'aucun scan (cold-start) */}
      {member.scan_count === 0 && <ActivationGuide member={member} />}

      {/* #6 — Activer les notifications (se masque si déjà répondu) */}
      <NotificationsPrompt memberId={member.id} />

      <div className="w-full h-px bg-brand-gray/10" />

      {/* Profil card */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4">
        <SectionDivider label="votre profil" />
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
            <p className="font-ui text-xs text-brand-gray/50">
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
          <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Derniers scans</p>
          {recentScans.map(scan => (
            <div key={scan.id} className="flex items-center justify-between py-2 border-b border-brand-gray/10">
              <div className="flex flex-col gap-0.5">
                <span className="font-ui text-sm font-light text-brand-white/70">{scan.scanner_name || 'Anonyme'}</span>
                {scan.location && (
                  <span className="font-ui text-xxs text-brand-gray/55">📍 {scan.location}</span>
                )}
              </div>
              {/* suppressHydrationWarning : toLocaleDateString dépend du fuseau (SSR UTC ≠ client). */}
              <span suppressHydrationWarning className="font-ui text-xs text-brand-gray/50 flex-shrink-0">{formatDate(scan.scanned_at)}</span>
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
