'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface ConversationMessage {
  id: string; member_id: string; content: string; sender_contact: string | null;
  reply: string | null; replied_at: string | null; read_at: string | null; created_at: string;
  members: { name: string; photo_url: string | null; instagram: string | null; auth_user_id?: string | null; };
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
  } catch {}
}

// ─── Formulaire de réponse (visible uniquement pour le membre propriétaire) ──

function ReplyForm({ messageId, memberId, onReplied }: {
  messageId: string;
  memberId: string;
  onReplied: (reply: string) => void;
}) {
  const [reply,   setReply]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, memberId, reply: reply.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de l\'envoi.');
      }

      onReplied(reply.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      <p className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">
        Votre réponse
      </p>
      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="Écrivez votre réponse..."
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-3 outline-none transition-colors placeholder:text-brand-gray/20 rounded-[2px] resize-none"
      />
      {error && <p className="font-ui text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading || !reply.trim()}
        className="w-full py-3 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Envoi...' : 'Répondre'}
      </button>
    </form>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ConversationClient({
  message: initialMessage,
  isOwner = false,
}: {
  message: ConversationMessage;
  isOwner?: boolean;
}) {
  const [message, setMessage]                   = useState(initialMessage);
  const [replyJustArrived, setReplyJustArrived] = useState(false);
  const [pushAsked, setPushAsked]               = useState(false);
  const [pushGranted, setPushGranted]           = useState(false);
  const [vuStatus, setVuStatus]                 = useState<string | null>(initialMessage.read_at);

  const memberName = message.members?.name || 'Ce membre';

  useEffect(() => {
    if (!isOwner || message.read_at) return;
    fetch('/api/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, memberId: message.member_id }),
    }).catch(() => {});
  }, [isOwner, message.id, message.member_id, message.read_at]);

  useEffect(() => {
    if (isOwner || !message.reply) return;
    fetch('/api/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, memberId: message.member_id }),
    }).then(r => r.json()).then(d => { if (d.ok) setVuStatus(new Date().toISOString()); }).catch(() => {});
  }, [isOwner, message.id, message.member_id, message.reply]);

  useEffect(() => {
    if (message.reply) return;
    const channel = supabase.channel(`conv-${message.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `id=eq.${message.id}` },
        (payload) => {
          const updated = payload.new as ConversationMessage;
          if (updated.reply) {
            setMessage(m => ({ ...m, reply: updated.reply, replied_at: updated.replied_at }));
            setReplyJustArrived(true);
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(`${memberName} vous a répondu.`, {
                body: updated.reply?.slice(0, 80) || '',
                icon: '/icon-192.png',
              });
            }
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [message.id, message.reply, memberName]);

  const handleSubscribePush = async () => {
    await subscribePush(message.id);
    setPushGranted(typeof Notification !== 'undefined' && Notification.permission === 'granted');
    setPushAsked(true);
  };

  const handleReplied = (reply: string) => {
    setMessage(m => ({ ...m, reply, replied_at: new Date().toISOString() }));
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col w-full max-w-xs md:max-w-sm gap-6">

        {/* Header membre */}
        <div className="flex items-center gap-3 animate-stagger-1">
          <div className="w-10 h-10 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden flex-shrink-0">
            {message.members?.photo_url
              ? <img src={`${message.members.photo_url}?width=80&quality=80`} alt={memberName} className="w-full h-full object-cover" />
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

        {/* Message du scanner */}
        <div className="animate-stagger-2 flex flex-col gap-1">
          <p className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase mb-1">
            {isOwner ? 'Message reçu' : 'Votre message'} · {formatDate(message.created_at)}
          </p>
          <div className={`max-w-[85%] p-4 bg-brand-white/5 border border-brand-gray/15 rounded-[2px] ${isOwner ? 'self-start rounded-tl-none' : 'self-end ml-auto rounded-tr-none'}`}>
            <p className="font-display text-lg font-light italic leading-relaxed text-brand-white/80">
              &ldquo;{message.content}&rdquo;
            </p>
            {message.sender_contact && (
              <p className="font-ui text-xs text-brand-gray/30 mt-2">— {message.sender_contact}</p>
            )}
          </div>
        </div>

        {/* Réponse ou formulaire ou attente */}
        <div className="animate-stagger-3 flex flex-col gap-1">
          {message.reply ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">
                  {isOwner ? 'Votre réponse' : `${memberName} a répondu`} · {message.replied_at ? formatDate(message.replied_at) : ''}
                </p>
                {!isOwner && vuStatus && (
                  <p className="font-ui text-xxs text-brand-gray/20 italic">Lu ✓</p>
                )}
              </div>
              <div className={`max-w-[85%] p-4 border border-brand-white/20 rounded-[2px] ${replyJustArrived ? 'animate-slide-right' : ''} ${isOwner ? 'self-end ml-auto rounded-tr-none' : 'self-start rounded-tl-none'}`}>
                <p className="font-display text-lg font-light italic leading-relaxed text-brand-white/90">
                  &ldquo;{message.reply}&rdquo;
                </p>
              </div>
            </>
          ) : isOwner ? (
            <ReplyForm
              messageId={message.id}
              memberId={message.member_id}
              onReplied={handleReplied}
            />
          ) : (
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
                <button onClick={handleSubscribePush}
                  className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.1em] hover:border-brand-gray/35 transition-colors"
                  style={{ minHeight: '44px' }}
                >
                  Me notifier quand il répond
                </button>
              ) : pushGranted ? (
                <p className="font-ui text-xs text-brand-gray/30 italic">
                  Vous serez notifié(e) dès qu&apos;il répond.
                </p>
              ) : (
                <p className="font-ui text-xs text-brand-gray/20 italic">
                  Notifications refusées — revenez sur cette page pour voir la réponse.
                </p>
              )}

              <p className="font-ui text-xxs text-brand-gray/20 leading-relaxed">
                Cette page se met à jour automatiquement.
              </p>
            </div>
          )}
        </div>

        <div className="w-full h-px bg-brand-gray/10" />

        <div className="flex flex-col gap-3 animate-stagger-4">
          {!isOwner && message.members?.instagram && (
            <a href={`https://instagram.com/${message.members.instagram.replace('@', '')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-full py-3 border border-brand-gray/15 text-center font-ui text-sm font-light tracking-[0.15em] hover:border-brand-gray/40 transition-colors"
              style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              @{message.members.instagram.replace('@', '')}
            </a>
          )}
          <Link href={isOwner ? '/dashboard' : '/'}
            className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors text-center py-2"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isOwner ? '← retour au dashboard' : '← retour à l\'accueil'}
          </Link>
        </div>
      </div>
    </main>
  );
}
