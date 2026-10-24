'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { captureEvent } from '@/lib/posthog-client';
import { MAX_CONVERSATIONS, CONVERSATION_WINDOW_DAYS } from '@/lib/constants';
import type { Message } from '@/lib/types';
import { timeAgo } from './utils';

// ─── Upgrade banner (CTA contextuel ré-utilisable) ───────────────────────────

// Mène à l'offre des réglages (prix, avantages, CGV à accepter) plutôt que
// directement au paiement : le porteur voit ce qu'il achète avant de payer.
function UpgradeBanner({ memberId, source, headline, sublabel, onUpgrade }: {
  memberId:  string;
  source:    string;
  headline:  string;
  sublabel:  string;
  onUpgrade: () => void;
}) {
  React.useEffect(() => {
    captureEvent('upgrade_cta_viewed', { member_id: memberId, plan: 'free', source });
  }, [memberId, source]);

  const handleClick = () => {
    captureEvent('upgrade_clicked', { member_id: memberId, plan: 'free', source });
    onUpgrade();
  };

  return (
    <button
      onClick={handleClick}
      className="w-full bg-[#0a0a08] border border-[#C5A059]/25 rounded-[2px] p-3 flex items-center gap-3 hover:border-[#C5A059]/50 transition-colors text-left"
    >
      <span aria-hidden="true" className="font-ui text-base text-[#C5A059]/70 leading-none">✦</span>
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="font-ui text-xs tracking-[0.12em] uppercase text-[#C5A059]/80">{headline}</span>
        <span className="font-ui text-xxs text-brand-gray/50">{sublabel}</span>
      </div>
      <span className="font-ui text-xxs text-[#C5A059]/85 tracking-[0.15em] uppercase">
        Voir l’offre<span aria-hidden="true"> ✦</span>
      </span>
    </button>
  );
}

// ─── Inbox (Messages) ─────────────────────────────────────────────────────────

export default function InboxSection({ messages: initialMessages, memberId, plan, recentConversations, totalConversations, onUpgrade }: {
  messages: Message[];
  memberId: string;
  plan: 'free' | 'premium';
  /** Ouvre l'offre premium des réglages. */
  onUpgrade: () => void;
  // Conversations qui occupent le plafond : fenêtre glissante, hors bloquées.
  recentConversations: number;
  totalConversations: number;
}) {
  const [messages, setMessages]         = useState(initialMessages);
  const [reportingId,  setReportingId]  = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reportError,  setReportError]  = useState<string | null>(null);
  const [reported,     setReported]     = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore]   = useState(false);
  // Nombre de cartes au 1er rendu : celles AU-DELÀ (chargées via « Voir plus »)
  // s'animent à l'arrivée (slide-in), les initiales non (elles ont déjà joué).
  // Suppose initialMessages stable par montage (rendu serveur, pas de refresh
  // dans ce sous-arbre) — vrai aujourd'hui.
  const [initialCount] = useState(initialMessages.length);
  // Pagination basée sur le total AFFICHÉ (totalConversations = racine, bloquées
  // incluses) — pas sur recentConversations (fenêtre glissante hors bloquées, qui
  // pilote le plafond premium). Sinon les conv bloquées masqueraient "Voir plus".
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
    setReportError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, memberId }),
      });
      if (res.ok) {
        setReported(prev => new Set(prev).add(messageId));
      } else {
        // Échec : sans feedback l'utilisateur croyait avoir signalé. On rouvre le
        // confirm (bouton réessayer) et on affiche l'erreur.
        setReportError(messageId);
        setConfirmingId(messageId);
      }
    } catch {
      setReportError(messageId);
      setConfirmingId(messageId);
    }
    setReportingId(null);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="animate-float w-16 h-16 rounded-full border border-brand-gray/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-brand-gray/50">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="animate-stagger-1 font-display text-lg md:text-xl font-light italic text-brand-gray/50">Aucun message pour l’instant.</p>
        <p className="animate-stagger-2 font-ui text-xs md:text-sm text-brand-gray/55 leading-relaxed">
          Quand quelqu’un scannera votre QR code<br />et vous enverra un message, il appara&icirc;tra ici.
        </p>
        <div className="animate-stagger-3 w-px h-6 bg-gradient-to-b from-transparent via-brand-white/10 to-transparent" />
        <p className="animate-stagger-4 font-ui text-xxs text-brand-gray/50 leading-relaxed">
          Portez votre t-shirt. Sortez. Le reste suivra.
        </p>
        <Link href={`/profil/${memberId}?preview=1`}
          className="animate-stagger-4 font-ui text-xs text-brand-white/50 tracking-[0.1em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-2"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          Vivez votre premier scan →
        </Link>
      </div>
    );
  }

  const limit       = MAX_CONVERSATIONS[plan];
  const showWarning = plan === 'free' && limit !== Infinity && recentConversations >= 2;
  const atLimit     = plan === 'free' && limit !== Infinity && recentConversations >= limit;

  return (
    <div className="w-full flex flex-col gap-2">
      {showWarning && (
        <UpgradeBanner
          memberId={memberId}
          source="inbox_conversation_limit"
          headline={atLimit ? 'Limite atteinte' : `${recentConversations}/${limit} conversations sur ${CONVERSATION_WINDOW_DAYS} jours`}
          sublabel={atLimit ? `Un créneau se libère ${CONVERSATION_WINDOW_DAYS} jours après chaque conversation. Passez premium pour lever la limite.` : 'Passez premium pour des conversations illimitées.'}
          onUpgrade={onUpgrade}
        />
      )}
      {messages.map((msg, i) => {
        const isReported = reported.has(msg.id);
        const isNew = i >= initialCount; // chargé via « Voir plus » → slide-in
        return (
          <div key={msg.id} className={`w-full bg-[#080808] border rounded-[2px] p-3 flex flex-col gap-2 transition-opacity duration-500 ${isNew ? 'animate-slide-right' : ''} ${isReported ? 'opacity-30' : ''} ${msg.blocked_at ? 'border-red-500/20 opacity-60' : !msg.read_at ? 'border-brand-white/20' : 'border-brand-gray/10'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className={`font-ui text-sm leading-relaxed ${!msg.read_at ? 'text-brand-white/90' : 'text-brand-gray/60'}`}>
                  {msg.content}
                </p>
              </div>
              {!msg.read_at && (
                <span className="animate-unread w-2 h-2 rounded-full bg-brand-white flex-shrink-0 mt-1" />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-ui text-xs text-brand-gray/55">
                  {msg.sender_name
                    ? <><span className="text-brand-white/75">{msg.sender_name}</span>{msg.sender_contact ? ` · ${msg.sender_contact}` : ''}</>
                    : (msg.sender_contact || 'Anonyme')}
                </span>
                <span aria-hidden="true" className="text-brand-gray/15">·</span>
                <span className="font-ui text-xs text-brand-gray/55">
                  {timeAgo(msg.created_at)}
                </span>
              </div>

              {msg.blocked_at ? (
                /* Conversation bloquée — gérer/débloquer depuis la conversation */
                <div className="flex items-center gap-2">
                  <span className="font-ui text-xxs text-red-400/80 tracking-[0.1em] uppercase">Bloqué</span>
                  <span aria-hidden="true" className="text-brand-gray/10">|</span>
                  <Link href={`/conversation/${msg.id}`}
                    className="font-ui text-xs text-brand-gray/50 hover:text-brand-white/80 transition-colors">
                    Gérer
                  </Link>
                </div>
              ) : (
              <div className="flex items-center gap-2">
                {msg.reply ? (
                  <span className="font-ui text-xxs text-brand-gray/55">
                    {msg.reply_read_at ? 'Lu ✓' : 'Répondu'}
                  </span>
                ) : (
                  <Link href={`/conversation/${msg.id}`}
                    className="font-ui text-xs text-brand-white/60 hover:text-brand-white transition-colors">
                    Répondre
                  </Link>
                )}
                <span aria-hidden="true" className="text-brand-gray/10">|</span>
                {isReported ? (
                  <span className="font-ui text-xxs text-red-400/80">Signalé</span>
                ) : confirmingId === msg.id ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => handleReport(msg.id)} disabled={reportingId === msg.id}
                      className="font-ui text-xxs text-red-400 hover:text-red-300 transition-colors">
                      Confirmer
                    </button>
                    <button onClick={() => setConfirmingId(null)}
                      className="font-ui text-xxs text-brand-gray/55 hover:text-brand-white/80 transition-colors">
                      Annuler
                    </button>
                    {reportError === msg.id && <span className="font-ui text-xxs text-red-400/80">échec</span>}
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(msg.id)}
                    className="font-ui text-xxs text-brand-gray/55 hover:text-red-400 transition-colors"
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
          className="w-full py-3 border border-brand-gray/10 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/55 hover:border-brand-gray/25 hover:text-brand-white/80 transition-colors rounded-[2px] mt-2">
          Voir plus
        </button>
      )}
    </div>
  );
}
