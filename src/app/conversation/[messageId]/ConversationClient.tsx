'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import SunToggle from '@/app/components/ui/SunToggle';
import { MAX_THREAD_MESSAGES as MAX_THREAD } from '@/lib/constants';
import { haptic } from '@/lib/haptics';

interface ConversationMessage {
  id: string; member_id: string; content: string; sender_contact: string | null;
  sender_name: string | null;
  read_at: string | null; created_at: string;
  members: { name: string; photo_url: string | null; instagram: string | null; auth_user_id?: string | null; };
}

interface ThreadReply {
  id: string; content: string; author: string; created_at: string;
  read_at?: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// Un device n'a qu'UN scope à la fois (push_subscriptions.onConflict:'endpoint').
// On choisit donc le bon scope selon le viewer :
//   * scanner → thread (messageId) : abonné à CETTE conversation.
//   * porteur → membre (memberId)  : abonné à TOUS ses messages, comme depuis le
//     dashboard. Indispensable car la réponse du scanner notifie le porteur via
//     notifyMemberSubscribers (member_id) ; s'abonner ici en thread scope
//     écraserait l'abonnement membre et il ne recevrait plus rien.
async function subscribePush(scope: { messageId: string } | { memberId: string }): Promise<void> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const reg = await navigator.serviceWorker.register('/sw.js');
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    const padding = '='.repeat((4 - vapidKey.length % 4) % 4);
    const base64  = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    const key     = Uint8Array.from(Array.from(raw), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j   = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } },
        ...scope,
      }),
    });
  } catch (err) { console.error('[push] Échec inscription push:', err); }
}

// ─── Push prompt avec iOS-awareness ─────────────────────────────────────────
// Sur iOS Safari, le Web Push exige que le site soit installé comme PWA
// (iOS 16.4+). Sinon, la permission est silencieusement refusée. On affiche
// un hint pour guider l'utilisateur vers "Ajouter à l'écran d'accueil".

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function PushPrompt({ pushAsked, pushGranted, pushLoading, onSubscribe, hasContact }: {
  pushAsked: boolean;
  pushGranted: boolean;
  pushLoading: boolean;
  onSubscribe: () => void;
  hasContact: boolean;
}) {
  const [iosNotPwa, setIosNotPwa] = useState(false);
  useEffect(() => { setIosNotPwa(isIOS() && !isStandalonePWA()); }, []);

  if (pushAsked) {
    if (pushGranted) {
      return <p className="font-ui text-xs text-green-400/50 italic">✓ Notifications activées.</p>;
    }
    return (
      <p className="font-ui text-xs text-brand-gray/55 italic leading-relaxed">
        Notifications désactivées.{' '}
        {hasContact
          ? 'Vous recevrez un email à la place.'
          : 'Revenez sur cette page pour voir la réponse.'}
      </p>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {iosNotPwa && (
        <p className="font-ui text-xxs text-brand-gray/60 leading-relaxed">
          Sur iPhone : ajoutez d&apos;abord la page à l&apos;écran d&apos;accueil
          (<span className="text-brand-white/50">Partager → Sur l&apos;écran d&apos;accueil</span>)
          pour activer les notifications.
        </p>
      )}
      <button onClick={onSubscribe} disabled={pushLoading}
        className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.1em] hover:border-brand-gray/35 transition-colors disabled:opacity-40"
        style={{ minHeight: '44px' }}>
        {pushLoading ? 'Activation...' : 'Me notifier de sa réponse'}
      </button>
    </div>
  );
}

// ─── Formulaire de réponse (membre OU scanner) ──────────────────────────────

function ThreadReplyForm({ messageId, author, onSent, onClosed }: {
  messageId: string;
  author: 'scanner' | 'member';
  onSent: (reply: ThreadReply) => void;
  onClosed: (code: 'blocked' | 'thread_limit') => void;
}) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    haptic('light');
    try {
      const res = await fetch('/api/conversation/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: text.trim(), author }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Course : conversation close (blocage) ou pleine côté serveur → on
        // remonte au parent qui bascule l'UI sur l'état terminal (fin du form).
        if (data.code === 'blocked' || data.code === 'thread_limit') {
          onClosed(data.code);
          return;
        }
        throw new Error(data.error || 'Erreur.');
      }
      if (data.moderated) {
        setError('Ce message enfreint nos règles et n’a pas été envoyé.');
        return;
      }
      onSent({ id: data.replyId, content: text.trim(), author, created_at: new Date().toISOString() });
      setText('');
      haptic('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={2000}
        rows={3}
        aria-label={author === 'member' ? 'Votre réponse' : 'Votre message'}
        placeholder={author === 'member' ? 'Votre réponse...' : 'Répondre...'}
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-3 outline-none transition-colors placeholder:text-brand-gray/50 rounded-[2px] resize-none"
      />
      {error && <p className="animate-fade-in font-ui text-sm text-red-400" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="w-full py-3 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Envoi...' : 'Répondre'}
      </button>
    </form>
  );
}

// ─── Bulle de message ────────────────────────────────────────────────────────

function ChatBubble({ content, date, isRight, animate }: {
  content: string; date: string; isRight: boolean; animate?: boolean;
}) {
  return (
    <div className={`max-w-[85%] ${isRight ? 'self-end ml-auto' : 'self-start'} ${animate ? 'animate-slide-right' : ''}`}>
      <div className={`p-4 border rounded-[2px] ${isRight ? 'border-brand-white/20 rounded-tr-none' : 'bg-brand-white/5 border-brand-gray/15 rounded-tl-none'}`}>
        <p className="font-display text-base font-light italic leading-relaxed text-brand-white/85">
          &ldquo;{content}&rdquo;
        </p>
      </div>
      <p className={`font-ui text-xxs text-brand-gray/50 mt-1 ${isRight ? 'text-right' : ''}`}>{formatDate(date)}</p>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ConversationClient({
  message: initialMessage,
  isOwner = false,
  originDevice = true,
  thread: initialThread = [],
  blocked: initialBlocked = false,
}: {
  message: ConversationMessage;
  isOwner?: boolean;
  /** Appareil d'où le passant a écrit (cookie) : lui seul répond en son nom. */
  originDevice?: boolean;
  thread?: ThreadReply[];
  blocked?: boolean;
}) {
  const message = initialMessage;
  const [thread, setThread]           = useState<ThreadReply[]>(initialThread);
  const [pushAsked, setPushAsked]     = useState(false);
  const [pushGranted, setPushGranted] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  // IDs déjà notifiés (système) — évite la double notif (broadcast + postgres_changes).
  const notifiedRef = useRef<Set<string>>(new Set());

  // ─── Blocage (porteur uniquement) ──────────────────────────────────────
  const [isBlocked, setIsBlocked]       = useState(initialBlocked);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError]     = useState('');
  // Verrou posé quand le SERVEUR refuse une réponse (course : l'autre a atteint
  // la limite / le porteur a bloqué entre le chargement SSR et l'envoi). Sans ça
  // le formulaire restait actif et l'erreur s'affichait sous un champ réinscriptible.
  const [limitReached, setLimitReached] = useState(false);

  const setBlock = async (action: 'block' | 'unblock') => {
    if (action === 'block' && !window.confirm('Bloquer cette personne ? Elle ne pourra plus vous écrire, ici comme ailleurs.')) return;
    setBlockLoading(true);
    setBlockError('');
    try {
      const res = await fetch('/api/conversation/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, memberId: message.member_id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur.');
      setIsBlocked(action === 'block');
      if (action === 'block') haptic('warning'); // action lourde / irréversible

    } catch (err) {
      setBlockError(err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setBlockLoading(false);
    }
  };

  const memberName = message.members?.name || 'Ce membre';
  const totalMessages = 1 + thread.length; // message initial + thread
  const canReply = totalMessages < MAX_THREAD && !limitReached;

  // Qui doit répondre en dernier ? Alterne scanner/member.
  // Le scanner est toujours l'auteur du message racine.
  const lastAuthor = thread.length > 0
    ? thread[thread.length - 1].author
    : 'scanner';
  const myRole = isOwner ? 'member' : 'scanner';
  const isMyTurn = lastAuthor !== myRole && canReply;

  // ─── Rattrapage : resynchronise le thread depuis le serveur ────────────
  // Un message arrivé pendant une coupure realtime (onglet caché, reconnexion)
  // est sinon perdu jusqu'à un refresh. Merge dédupliqué (le serveur fait foi sur
  // les non-modérés ; on garde un éventuel optimiste local pas encore répliqué).
  const refetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversation/${message.id}/thread`);
      if (!res.ok) return;
      const data = await res.json();
      const replies = (data.thread ?? []) as ThreadReply[];
      setThread(prev => {
        const byId = new Map(prev.map(r => [r.id, r] as const));
        for (const r of replies) byId.set(r.id, r);
        return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    } catch { /* hors-ligne : on retentera au prochain focus / reconnexion */ }
  }, [message.id]);

  // Resync au retour sur l'onglet.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refetchThread(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetchThread]);

  // ─── Mark-read côté membre ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOwner || message.read_at) return;
    fetch('/api/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, memberId: message.member_id }),
    }).catch(() => {});
  }, [isOwner, message.id, message.member_id, message.read_at]);

  // ─── Realtime : écoute les nouveaux messages du thread ─────────────────
  useEffect(() => {
    const appendReply = (newReply: ThreadReply) => {
      if (!newReply?.id) return;
      setThread(prev => (prev.some(r => r.id === newReply.id) ? prev : [...prev, newReply]));
      // Notif système : seulement si l'onglet est CACHÉ, que le message vient de
      // l'AUTRE (jamais soi-même), et pas déjà notifié (broadcast + postgres_changes
      // peuvent doubler pour le porteur).
      if (
        newReply.author !== myRole &&
        typeof document !== 'undefined' && document.hidden &&
        typeof Notification !== 'undefined' && Notification.permission === 'granted' &&
        !notifiedRef.current.has(newReply.id)
      ) {
        notifiedRef.current.add(newReply.id);
        new Notification('Nouveau message', { body: newReply.content.slice(0, 80), icon: '/icon.svg' });
      }
    };

    const channel = supabase.channel(`thread-${message.id}`)
      // Broadcast (canal public) — source principale : fonctionne pour le
      // scanner anon, car émis par les routes reply sans lecture DB (modérés exclus).
      .on('broadcast', { event: 'new_message' }, (msg) => {
        appendReply(msg.payload as ThreadReply);
      })
      // postgres_changes — redondance pour le membre authentifié. ⚠️ se déclenche
      // sur TOUT insert (y compris modéré) → on filtre, sinon un message modéré
      // (non broadcast) s'afficherait au porteur.
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `parent_id=eq.${message.id}`,
      }, (payload) => {
        const row = payload.new as ThreadReply & { moderated?: boolean };
        if (row.moderated) return;
        appendReply(row);
      })
      // À chaque (re)connexion du canal, on resync le thread → rattrape les
      // messages broadcastés pendant une coupure (le broadcast n'est pas rejoué).
      .subscribe((status) => { if (status === 'SUBSCRIBED') refetchThread(); });

    return () => { supabase.removeChannel(channel); };
  }, [message.id, myRole, refetchThread]);

  // ─── Push ──────────────────────────────────────────────────────────────
  const handleSubscribePush = async () => {
    setPushLoading(true);
    try {
      await subscribePush(isOwner ? { memberId: message.member_id } : { messageId: message.id });
      setPushGranted(typeof Notification !== 'undefined' && Notification.permission === 'granted');
    } catch { setPushGranted(false); }
    setPushAsked(true);
    setPushLoading(false);
  };

  const handleThreadReply = (reply: ThreadReply) => {
    // Dédup : l'écho broadcast peut arriver AVANT la réponse du fetch (race) →
    // sans ce garde, on verrait son propre message deux fois.
    setThread(prev => (prev.some(r => r.id === reply.id) ? prev : [...prev, reply]));
  };

  // ─── Feedback ──────────────────────────────────────────────────────────
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState<string | null>(null);
  const handleFeedback = async (rating: 'positive' | 'neutral' | 'negative') => {
    setFeedbackValue(rating);
    setFeedbackSent(true);
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'conversation', rating, memberId: message.member_id, messageId: message.id }),
    }).catch(() => {});
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <SunToggle />
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col w-full max-w-xs md:max-w-sm gap-4">

        {/* Header */}
        <div className="flex items-center gap-3 animate-stagger-1">
          <div className="w-10 h-10 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden flex-shrink-0">
            {message.members?.photo_url
              ? <Image src={message.members.photo_url} alt={`Photo de ${memberName}`} width={40} height={40} className="w-full h-full object-cover" />
              : <span className="font-display text-sm font-light text-brand-gray/50">{getInitials(memberName)}</span>
            }
          </div>
          <div>
            <p className="font-ui text-sm font-medium tracking-[0.2em]">{memberName.toUpperCase()}</p>
            <p className="font-ui text-xs text-brand-gray/55 tracking-[0.05em]">
              {isOwner
                ? (message.sender_name ? `Message de ${message.sender_name}` : 'Message reçu')
                : 'Votre conversation'}
            </p>
          </div>
        </div>

        <div className="w-full h-px bg-brand-gray/10 animate-line-draw" />

        {/* ─── Fil de conversation ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 animate-stagger-2">

          {/* Message initial du scanner */}
          <ChatBubble
            content={message.content}
            date={message.created_at}
            isRight={!isOwner}
          />

          {/* Messages du thread (les anciennes replies legacy sont migrées ici) */}
          {thread.map((reply, i) => (
            <ChatBubble
              key={reply.id}
              content={reply.content}
              date={reply.created_at}
              isRight={(reply.author === 'member') === isOwner}
              animate={i === thread.length - 1}
            />
          ))}
        </div>

        {/* Compteur de messages — donne au lecteur la visibilité sur la limite */}
        {totalMessages > 0 && (
          <div className="flex items-center justify-center gap-3 -my-2">
            <div className="flex-1 h-px bg-brand-gray/10" />
            <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.2em] uppercase tabular-nums">
              {totalMessages}/{MAX_THREAD} échanges
            </span>
            <div className="flex-1 h-px bg-brand-gray/10" />
          </div>
        )}

        {/* ─── Zone de réponse ────────────────────────────────────────────── */}
        <div className="animate-stagger-3">
          {isBlocked ? (
            /* Conversation bloquée par le porteur */
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-px h-6 bg-gradient-to-b from-transparent via-red-500/20 to-transparent" />
              <p className="font-ui text-sm text-brand-gray/50 text-center leading-relaxed">
                {isOwner ? 'Vous avez bloqué cette personne.' : 'Cette conversation est close.'}
              </p>
              {isOwner && (
                <>
                  <p className="font-ui text-xs text-brand-gray/55 text-center leading-relaxed max-w-[18rem]">
                    Elle ne peut plus vous écrire, ici comme ailleurs.
                  </p>
                  <button onClick={() => setBlock('unblock')} disabled={blockLoading}
                    className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors py-2 disabled:opacity-40"
                    style={{ minHeight: '44px' }}>
                    {blockLoading ? '...' : 'Débloquer'}
                  </button>
                </>
              )}
              {blockError && <p className="animate-fade-in font-ui text-xs text-red-400" role="alert">{blockError}</p>}
            </div>
          ) : !canReply ? (
            /* Conversation terminée */
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
              <p className="font-ui text-sm text-brand-gray/50 text-center leading-relaxed">
                Cet échange est arrivé à terme.
              </p>
              <p className="font-ui text-xs text-brand-gray/55 text-center leading-relaxed max-w-[18rem]">
                In Real Society limite chaque conversation à {MAX_THREAD} messages — pour que la suite se passe ailleurs.
                {message.sender_contact && !isOwner && (
                  <><br /><br />Continuez sur le canal partagé.</>
                )}
                {isOwner && (
                  <><br /><br />Si la conversation a du potentiel, proposez un canal direct (Instagram, numéro) dans votre dernier message.</>
                )}
              </p>
            </div>
          ) : !isOwner && !originDevice ? (
            /* Lien ouvert ailleurs : le passant sur un autre appareil, ou le porteur déconnecté */
            <div className="flex flex-col gap-3 py-2">
              <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
                Vous avez écrit ce message ? Pour répondre, ouvrez cette page sur l&apos;appareil d&apos;où vous l&apos;avez envoyé.
              </p>
              <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
                Vous êtes {memberName} ?{' '}
                <Link href={`/auth/login?redirect=${encodeURIComponent(`/conversation/${message.id}`)}`}
                  className="text-brand-white/80 underline underline-offset-4 hover:text-brand-white transition-colors">
                  Connectez-vous pour répondre
                </Link>.
              </p>
            </div>
          ) : isMyTurn ? (
            /* C'est mon tour de répondre — unifié sur ThreadReplyForm */
            <ThreadReplyForm
              messageId={message.id}
              author={myRole}
              onSent={handleThreadReply}
              onClosed={(code) => code === 'blocked' ? setIsBlocked(true) : setLimitReached(true)}
            />
          ) : (
            /* En attente de l'autre */
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase">
                En attente de réponse
              </p>
              <div className="flex items-center gap-1.5 px-4 py-3 border border-brand-gray/10 rounded-[2px] rounded-tl-none">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-gray/30 animate-typing-1" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-gray/30 animate-typing-2" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-gray/30 animate-typing-3" />
              </div>
              <PushPrompt
                pushAsked={pushAsked}
                pushGranted={pushGranted}
                pushLoading={pushLoading}
                onSubscribe={handleSubscribePush}
                hasContact={!!message.sender_contact}
              />
              {!isOwner && !message.sender_contact && (
                <p className="font-ui text-xxs text-brand-gray/50 italic mt-1">
                  Vous n&apos;avez pas laissé de contact — la notification push est le seul moyen d&apos;être prévenu.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ─── Feedback (quand il y a eu au moins 1 échange) ──────────────── */}
        {!canReply && !feedbackSent && (
          <div className="flex flex-col items-center gap-2">
            <p className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase">
              Comment s&apos;est passé cet échange ?
            </p>
            <div className="flex items-center gap-4">
              {[
                { rating: 'positive' as const, emoji: '😊', label: 'Bien' },
                { rating: 'neutral'  as const, emoji: '😐', label: 'Neutre' },
                { rating: 'negative' as const, emoji: '😕', label: 'Bof' },
              ].map(opt => (
                <button key={opt.rating} onClick={() => handleFeedback(opt.rating)}
                  className="flex flex-col items-center gap-1 px-3 py-2 border border-brand-gray/10 rounded-[2px] hover:border-brand-gray/30 hover:bg-brand-white/5 transition-all"
                  aria-label={opt.label}>
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="font-ui text-[9px] text-brand-gray/55 tracking-wide uppercase">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {feedbackSent && (
          <p className="font-ui text-xxs text-brand-gray/55 text-center italic">
            Merci pour votre retour{feedbackValue === 'positive' ? ' 😊' : feedbackValue === 'negative' ? ' — on fera mieux.' : '.'}
          </p>
        )}

        <div className="w-full h-px bg-brand-gray/10" />

        {/* ─── Footer ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 animate-stagger-4">
          {!isOwner && message.members?.instagram && (
            <a href={`https://instagram.com/${message.members.instagram.replace('@', '')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-full py-3 border border-brand-gray/15 text-center font-ui text-sm font-light tracking-[0.15em] hover:border-brand-gray/40 transition-colors"
              style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              @{message.members.instagram.replace('@', '')}
            </a>
          )}
          <Link href={isOwner ? '/dashboard' : '/'}
            className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors text-center py-2"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isOwner ? '← retour au dashboard' : '← retour'}
          </Link>

          {/* Bloquer — réservé au porteur, masqué si déjà bloqué */}
          {isOwner && !isBlocked && (
            <button onClick={() => setBlock('block')} disabled={blockLoading}
              className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase hover:text-red-400/70 transition-colors text-center py-2 disabled:opacity-40"
              style={{ minHeight: '44px' }}>
              {blockLoading ? '...' : 'Bloquer cette personne'}
            </button>
          )}
          {isOwner && !isBlocked && blockError && (
            <p className="animate-fade-in font-ui text-xxs text-red-400 text-center" role="alert">{blockError}</p>
          )}
        </div>
      </div>
    </main>
  );
}
