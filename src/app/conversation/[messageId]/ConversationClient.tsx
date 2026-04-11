'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface ConversationMessage {
  id: string; member_id: string; content: string; sender_contact: string | null;
  reply: string | null; replied_at: string | null; read_at: string | null; created_at: string;
  members: { name: string; photo_url: string | null; instagram: string | null; auth_user_id?: string | null; };
}

interface ThreadReply {
  id: string; content: string; author: string; created_at: string;
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

async function subscribePush(messageId: string): Promise<void> {
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
        messageId,
      }),
    });
  } catch (err) { console.error('[push] Échec inscription push:', err); }
}

const MAX_THREAD = 5;

// ─── Formulaire de réponse (membre OU scanner) ──────────────────────────────

function ThreadReplyForm({ messageId, author, onSent }: {
  messageId: string;
  author: 'scanner' | 'member';
  onSent: (reply: ThreadReply) => void;
}) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/conversation/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: text.trim(), author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur.');
      onSent({ id: data.replyId, content: text.trim(), author, created_at: new Date().toISOString() });
      setText('');
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
        placeholder={author === 'member' ? 'Votre réponse...' : 'Répondre...'}
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-3 outline-none transition-colors placeholder:text-brand-gray/20 rounded-[2px] resize-none"
      />
      {error && <p className="font-ui text-sm text-red-400">{error}</p>}
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
      <p className={`font-ui text-xxs text-brand-gray/20 mt-1 ${isRight ? 'text-right' : ''}`}>{formatDate(date)}</p>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ConversationClient({
  message: initialMessage,
  isOwner = false,
  thread: initialThread = [],
}: {
  message: ConversationMessage;
  isOwner?: boolean;
  thread?: ThreadReply[];
}) {
  const [message, setMessage]         = useState(initialMessage);
  const [thread, setThread]           = useState<ThreadReply[]>(initialThread);
  const [pushAsked, setPushAsked]     = useState(false);
  const [pushGranted, setPushGranted] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const memberName = message.members?.name || 'Ce membre';
  const totalMessages = 1 + (message.reply ? 1 : 0) + thread.length; // message initial + reply legacy + thread
  const canReply = totalMessages < MAX_THREAD;

  // Qui doit répondre en dernier ? Alterne scanner/member
  const lastAuthor = thread.length > 0
    ? thread[thread.length - 1].author
    : message.reply ? 'member' : 'scanner';
  const myRole = isOwner ? 'member' : 'scanner';
  const isMyTurn = lastAuthor !== myRole && canReply;

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
    const channel = supabase.channel(`thread-${message.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `parent_id=eq.${message.id}`,
      }, (payload) => {
        const newReply = payload.new as ThreadReply;
        setThread(prev => {
          if (prev.some(r => r.id === newReply.id)) return prev;
          return [...prev, newReply];
        });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Nouveau message', {
            body: newReply.content.slice(0, 80),
            icon: '/icon.svg',
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `id=eq.${message.id}`,
      }, (payload) => {
        const updated = payload.new as ConversationMessage;
        if (updated.reply && !message.reply) {
          setMessage(m => ({ ...m, reply: updated.reply, replied_at: updated.replied_at }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [message.id, message.reply]);

  // ─── Push ──────────────────────────────────────────────────────────────
  const handleSubscribePush = async () => {
    setPushLoading(true);
    try {
      await subscribePush(message.id);
      setPushGranted(typeof Notification !== 'undefined' && Notification.permission === 'granted');
    } catch { setPushGranted(false); }
    setPushAsked(true);
    setPushLoading(false);
  };

  const handleThreadReply = (reply: ThreadReply) => {
    setThread(prev => [...prev, reply]);
  };

  // ─── Legacy : premier reply du membre (ancien système) ─────────────────
  const handleLegacyReply = (reply: string) => {
    setMessage(m => ({ ...m, reply, replied_at: new Date().toISOString() }));
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
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col w-full max-w-xs md:max-w-sm gap-4">

        {/* Header */}
        <div className="flex items-center gap-3 animate-stagger-1">
          <div className="w-10 h-10 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden flex-shrink-0">
            {message.members?.photo_url
              ? <Image src={message.members.photo_url} alt={`Photo de ${memberName}`} width={40} height={40} className="w-full h-full object-cover" />
              : <span className="font-display text-sm font-light text-brand-gray/40">{getInitials(memberName)}</span>
            }
          </div>
          <div>
            <p className="font-ui text-sm font-medium tracking-[0.2em]">{memberName.toUpperCase()}</p>
            <p className="font-ui text-xs text-brand-gray/30 tracking-[0.05em]">
              {isOwner ? 'Message reçu' : 'Votre conversation'}
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

          {/* Réponse legacy du membre (ancien champ reply) */}
          {message.reply && (
            <ChatBubble
              content={message.reply}
              date={message.replied_at || message.created_at}
              isRight={isOwner}
            />
          )}

          {/* Messages du thread */}
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

        {/* ─── Zone de réponse ────────────────────────────────────────────── */}
        <div className="animate-stagger-3">
          {!canReply ? (
            /* Conversation terminée */
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
              <p className="font-ui text-xs text-brand-gray/25 text-center leading-relaxed">
                Cette conversation a atteint sa limite.
                {message.sender_contact && !isOwner && <><br />Continuez sur un autre canal.</>}
              </p>
            </div>
          ) : isMyTurn ? (
            /* C'est mon tour de répondre */
            message.reply || thread.length > 0 ? (
              /* Thread actif → formulaire thread */
              <ThreadReplyForm
                messageId={message.id}
                author={myRole}
                onSent={handleThreadReply}
              />
            ) : isOwner ? (
              /* Premier reply du membre (utilise l'ancien système) */
              <form onSubmit={async (e) => {
                e.preventDefault();
                const textarea = e.currentTarget.querySelector('textarea');
                const text = textarea?.value.trim();
                if (!text) return;
                try {
                  const res = await fetch('/api/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageId: message.id, memberId: message.member_id, reply: text }),
                  });
                  if (res.ok) handleLegacyReply(text);
                } catch {}
              }} className="w-full flex flex-col gap-3">
                <textarea maxLength={2000} rows={3} placeholder="Votre réponse..."
                  className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-3 outline-none transition-colors placeholder:text-brand-gray/20 rounded-[2px] resize-none" />
                <button type="submit"
                  className="w-full py-3 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200">
                  Répondre
                </button>
              </form>
            ) : null
          ) : (
            /* En attente de l'autre */
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">
                En attente de réponse
              </p>
              <div className="flex items-center gap-1.5 px-4 py-3 border border-brand-gray/10 rounded-[2px] rounded-tl-none">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-gray/30 animate-typing-1" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-gray/30 animate-typing-2" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-gray/30 animate-typing-3" />
              </div>
              {!pushAsked ? (
                <button onClick={handleSubscribePush} disabled={pushLoading}
                  className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.1em] hover:border-brand-gray/35 transition-colors disabled:opacity-40"
                  style={{ minHeight: '44px' }}>
                  {pushLoading ? 'Activation...' : 'Me notifier quand il répond'}
                </button>
              ) : pushGranted ? (
                <p className="font-ui text-xs text-green-400/50 italic">✓ Notifications activées.</p>
              ) : (
                <p className="font-ui text-xs text-brand-gray/20 italic">Notifications refusées — revenez sur cette page.</p>
              )}
            </div>
          )}
        </div>

        {/* ─── Feedback (quand il y a eu au moins 1 échange) ──────────────── */}
        {!canReply && !feedbackSent && (
          <div className="flex flex-col items-center gap-2">
            <p className="font-ui text-xxs text-brand-gray/25 tracking-[0.15em] uppercase">
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
                  <span className="font-ui text-[9px] text-brand-gray/25 tracking-wide uppercase">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {feedbackSent && (
          <p className="font-ui text-xxs text-brand-gray/25 text-center italic">
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
            className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors text-center py-2"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isOwner ? '← retour au dashboard' : '← retour'}
          </Link>
        </div>
      </div>
    </main>
  );
}
