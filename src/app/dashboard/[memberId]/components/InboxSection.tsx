'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { captureEvent } from '@/lib/posthog-client';
import { MAX_CONVERSATIONS } from '@/lib/constants';
import type { Message } from '@/lib/types';
import { timeAgo } from './utils';

// ─── Upgrade banner (CTA contextuel ré-utilisable) ───────────────────────────

function UpgradeBanner({ memberId, source, headline, sublabel }: {
  memberId: string;
  source:   string;
  headline: string;
  sublabel: string;
}) {
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    captureEvent('upgrade_cta_viewed', { member_id: memberId, plan: 'free', source });
  }, [memberId, source]);

  const handleClick = async () => {
    setLoading(true);
    captureEvent('upgrade_clicked', { member_id: memberId, plan: 'free', source });
    try {
      const res  = await fetch('/api/subscription/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // ignore
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full bg-[#0a0a08] border border-[#C5A059]/25 rounded-[2px] p-3 flex items-center gap-3 hover:border-[#C5A059]/50 transition-colors disabled:opacity-50 text-left"
    >
      <span className="font-ui text-base text-[#C5A059]/70 leading-none">✦</span>
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="font-ui text-xs tracking-[0.12em] uppercase text-[#C5A059]/80">{headline}</span>
        <span className="font-ui text-xxs text-brand-gray/40">{sublabel}</span>
      </div>
      <span className="font-ui text-xxs text-[#C5A059]/60 tracking-[0.15em] uppercase">
        {loading ? '...' : 'Passer ✦'}
      </span>
    </button>
  );
}

// ─── Inbox (Messages) ─────────────────────────────────────────────────────────

export default function InboxSection({ messages: initialMessages, memberId, plan, activeConversations, totalConversations }: {
  messages: Message[];
  memberId: string;
  plan: 'free' | 'premium';
  activeConversations: number;
  totalConversations: number;
}) {
  const [messages, setMessages]         = useState(initialMessages);
  const [reportingId,  setReportingId]  = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reported,     setReported]     = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore]   = useState(false);
  // Pagination basée sur le total AFFICHÉ (totalConversations = racine, bloquées
  // incluses) — pas sur activeConversations (hors bloquées, qui pilote le plafond
  // premium). Sinon les conv bloquées masqueraient "Voir plus".
  const hasMore = messages.length < totalConversations;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/messages?memberId=${memberId}&offset=${messages.length}&limit=10`);
      const data = await res.json();
      if (data.messages?.length) setMessages(prev => [...prev, ...data.messages]);
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
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="animate-float w-16 h-16 rounded-full border border-brand-gray/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-brand-gray/20">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="animate-stagger-1 font-display text-lg md:text-xl font-light italic text-brand-gray/40">Aucun message pour l&apos;instant.</p>
        <p className="animate-stagger-2 font-ui text-xs md:text-sm text-brand-gray/25 leading-relaxed">
          Quand quelqu&apos;un scannera votre QR code<br />et vous enverra un message, il appara&icirc;tra ici.
        </p>
        <div className="animate-stagger-3 w-px h-6 bg-gradient-to-b from-transparent via-brand-white/10 to-transparent" />
        <p className="animate-stagger-4 font-ui text-xxs text-brand-gray/20 leading-relaxed">
          Portez votre t-shirt. Sortez. Le reste suivra.
        </p>
      </div>
    );
  }

  const limit       = MAX_CONVERSATIONS[plan];
  const showWarning = plan === 'free' && limit !== Infinity && activeConversations >= 2;
  const atLimit     = plan === 'free' && limit !== Infinity && activeConversations >= limit;

  return (
    <div className="w-full flex flex-col gap-2">
      {showWarning && (
        <UpgradeBanner
          memberId={memberId}
          source="inbox_conversation_limit"
          headline={atLimit ? 'Limite atteinte' : `${activeConversations}/${limit} conversations`}
          sublabel={atLimit ? 'Plus aucun message ne peut t’atteindre. Passe premium pour débloquer.' : 'Passe premium pour des conversations illimitées.'}
        />
      )}
      {messages.map(msg => {
        const isReported = reported.has(msg.id);
        return (
          <div key={msg.id} className={`w-full bg-[#080808] border rounded-[2px] p-3 flex flex-col gap-2 ${msg.blocked_at ? 'border-red-500/20 opacity-60' : !msg.read_at ? 'border-brand-white/20' : 'border-brand-gray/10'}`}>
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

              {msg.blocked_at ? (
                /* Conversation bloquée — gérer/débloquer depuis la conversation */
                <div className="flex items-center gap-2">
                  <span className="font-ui text-xxs text-red-400/60 tracking-[0.1em] uppercase">Bloqué</span>
                  <span className="text-brand-gray/10">|</span>
                  <Link href={`/conversation/${msg.id}`}
                    className="font-ui text-xs text-brand-gray/40 hover:text-brand-gray/70 transition-colors">
                    Gérer
                  </Link>
                </div>
              ) : (
              <div className="flex items-center gap-2">
                {msg.reply ? (
                  <span className="font-ui text-xxs text-brand-gray/30">
                    {msg.reply_read_at ? 'Lu ✓' : 'Répondu'}
                  </span>
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
              )}
            </div>
          </div>
        );
      })}

      {/* Skeleton loaders : 3 cartes pulsantes pendant le fetch — meilleure
          perceived performance que le simple texte "Chargement..." */}
      {loadingMore && (
        <>
          {[0, 1, 2].map(i => (
            <div key={`skel-${i}`} className="animate-skeleton h-[68px]" />
          ))}
        </>
      )}

      {hasMore && !loadingMore && (
        <button onClick={loadMore}
          className="w-full py-3 border border-brand-gray/10 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/30 hover:border-brand-gray/25 hover:text-brand-gray/50 transition-colors rounded-[2px] mt-2">
          Voir plus
        </button>
      )}
    </div>
  );
}
