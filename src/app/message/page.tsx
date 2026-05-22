'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { captureEvent } from '@/lib/posthog-client';

// Conversion scanneur → porteur. Le scanneur vient de vivre le moment fort
// (signal envoyé / profil très demandé / fenêtre ratée) : c'est l'instant idéal
// pour retourner la perspective (« et si c'était toi qu'on scannait ? ») et le
// pousser vers la boutique. Vue + clic sont trackés pour mesurer la boucle.
function BecomeWearerCTA({ source, hook }: { source: string; hook: React.ReactNode }) {
  const router = useRouter();

  // Note : en dev, React StrictMode double-invoque cet effet → 2 events. Sans
  // effet en prod (mount unique, `source` stable par état terminal). Dédup côté
  // PostHog si besoin.
  useEffect(() => {
    captureEvent('wearer_cta_viewed', { source });
  }, [source]);

  const goShop = () => {
    captureEvent('wearer_cta_clicked', { source });
    router.push('/shop');
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <p className="font-ui text-xxs text-brand-gray/25 tracking-[0.25em] uppercase">Et toi ?</p>
      <p className="font-display text-xl font-light leading-snug text-center tracking-[0.02em]">{hook}</p>
      <button onClick={goShop}
        className="w-full py-3 border border-brand-white/30 font-ui text-sm font-light tracking-[0.2em] uppercase hover:border-brand-white/60 hover:bg-brand-white/5 active:scale-[0.98] transition-all rounded-[1px]"
        style={{ minHeight: '44px' }}>
        Découvrir le t-shirt →
      </button>
    </div>
  );
}

function MessageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberName = searchParams.get('name') || 'ce membre';
  const memberId   = searchParams.get('to')   || '';
  // rc=1 → ce membre exige un contact (surfacé en amont par le profil). La
  // source de vérité reste le serveur (code contact_required).
  const [contactRequired, setContactRequired] = useState(searchParams.get('rc') === '1');

  const [message, setMessage]     = useState('');
  const [contact, setContact]     = useState('');
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState('');
  const [moderated, setModerated] = useState(false);
  const [expired, setExpired]     = useState(false);
  const [windowHours, setWindowHours] = useState(24);
  const [limitReached, setLimitReached] = useState(false);
  const [conversationUrl, setConversationUrl] = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);

  const sendMessage = async (content: string, isQuickReply = false) => {
    if (!content.trim() || !memberId) return;
    // Garde client : si un contact est exigé et absent, on évite le roundtrip.
    if (contactRequired && !contact.trim()) {
      setError('Ce membre demande un @instagram ou un email pour pouvoir vous répondre.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          content:       content.trim(),
          senderContact: contact.trim() || null,
          isQuickReply,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Erreur lors de l\'envoi.';
        // Détection par code structuré (pas par string-matching de la copie FR).
        if (data.code === 'window_expired') {
          captureEvent('message_blocked_window_expired', { member_id: memberId });
          if (typeof data.windowHours === 'number') setWindowHours(data.windowHours);
          setExpired(true); setSending(false); return;
        }
        if (data.code === 'conversation_limit') {
          captureEvent('message_blocked_conversation_limit', { member_id: memberId });
          setLimitReached(true); setSending(false); return;
        }
        if (data.code === 'contact_required') {
          setContactRequired(true);
          setError('Ce membre demande un @instagram ou un email pour pouvoir vous répondre.');
          setSending(false); return;
        }
        throw new Error(errorMsg);
      }
      if (data.moderated) { setModerated(true); setSending(false); return; }

      captureEvent('message_submitted', {
        member_id:     memberId,
        is_quick_reply: isQuickReply,
        has_contact:    !!contact.trim(),
      });

      const url = `${window.location.origin}/conversation/${data.messageId}`;
      localStorage.setItem(`conversation_${memberId}`, url);
      setConversationUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  const handleCopy = () => {
    if (!conversationUrl) return;
    navigator.clipboard.writeText(conversationUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <p className="font-display text-2xl font-light">Ce moment est passé.</p>
        <p className="font-ui text-sm text-brand-gray/40 leading-relaxed">
          La fenêtre de {windowHours} heures est terminée.<br />
          La prochaine occasion sera la bonne.
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <BecomeWearerCTA source="window_expired" hook={<>La prochaine fois,<br />sois de l&apos;autre côté.</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-sm text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
          style={{ minHeight: '44px' }}>
          ← retour au profil
        </button>
      </div>
    );
  }

  if (limitReached) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <p className="font-display text-2xl font-light">{memberName} a déjà du monde autour.</p>
        <p className="font-ui text-sm text-brand-gray/40 leading-relaxed">
          Cette personne attire l&apos;attention.<br />
          Ses conversations en cours sont au complet.
        </p>
        <p className="font-ui text-xxs text-brand-gray/25 leading-relaxed">
          Revenez plus tard, ou croisez-la à nouveau.
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <BecomeWearerCTA source="conversation_limit" hook={<>Toi aussi,<br />fais tourner les têtes.</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-sm text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
          style={{ minHeight: '44px' }}>
          ← retour au profil
        </button>
      </div>
    );
  }

  if (moderated) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-14 h-14 rounded-full border border-red-500/20 flex items-center justify-center">
          <span className="font-display text-xl text-red-400/60">!</span>
        </div>
        <p className="font-display text-2xl font-light">Ce message ne peut pas être envoyé.</p>
        <p className="font-ui text-sm text-brand-gray/40 leading-relaxed">
          Votre message contient des termes qui ne respectent pas<br />
          les règles de notre espace. Évitez le langage offensant,<br />
          les menaces ou les contenus inappropriés.
        </p>
        <button onClick={() => setModerated(false)}
          className="animate-shimmer w-full py-3 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200"
          style={{ minHeight: '44px' }}>
          Reformuler mon message
        </button>
      </div>
    );
  }

  if (conversationUrl) {
    return (
      <div className="flex flex-col items-center gap-8 text-center animate-stagger-1 w-full">
        <div className="w-14 h-14 rounded-full border border-brand-white/20 flex items-center justify-center animate-success">
          <span style={{ fontSize: '16px' }}>✦</span>
        </div>
        <div className="flex flex-col gap-3">
          <p className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">Signal envoyé.</p>
          <p className="font-ui text-sm font-light text-brand-gray/50 leading-relaxed">
            {memberName} peut vous répondre directement ici.
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <p className="font-ui text-xs text-brand-gray/25 tracking-[0.2em] uppercase">Votre fil de conversation</p>
          <button onClick={() => router.push(conversationUrl)}
            className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200"
            style={{ minHeight: '44px' }}
          >
            Voir la conversation
          </button>
          <button onClick={handleCopy}
            className="w-full py-3 border border-brand-gray/20 font-ui text-sm font-light tracking-[0.15em] hover:border-brand-gray/40 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {copied ? '✓ Lien copié' : 'Copier le lien'}
          </button>
          <p className="font-ui text-xxs md:text-xs text-brand-gray/20 leading-relaxed">
            Ce lien est sauvegardé automatiquement.<br />Vous le retrouverez sur le profil de {memberName}.
          </p>
        </div>
        <div className="w-full h-px bg-brand-gray/10" />
        <BecomeWearerCTA source="message_sent" hook={<>Et si c&apos;était toi<br />qu&apos;on scannait ?</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors py-2"
          style={{ minHeight: '44px' }}>
          ← retour au profil
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="text-center flex flex-col gap-2 animate-stagger-1">
        <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">Un signal discret.</h2>
        <p className="font-ui text-sm font-light text-brand-gray/40 leading-relaxed">À {memberName}. Il pourra vous répondre directement.</p>
      </div>

      {/* Contact remonté */}
      <div className="flex flex-col gap-1 animate-stagger-2">
        <label className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">
          Votre @instagram ou email{' '}
          <span className={`normal-case tracking-normal ml-1 ${contactRequired ? 'text-[#C5A059]/80' : 'text-brand-white/30'}`}>
            ({contactRequired ? 'requis' : 'recommandé'})
          </span>
        </label>
        <p className="font-ui text-xxs md:text-xs text-brand-gray/20 leading-relaxed mb-1">
          {contactRequired
            ? 'Ce membre n’accepte que les messages avec un contact.'
            : 'Sans contact, il ne pourra pas vous répondre.'}
        </p>
        <input type="text" placeholder={contactRequired ? '@instagram ou email' : 'Anonyme par défaut'} value={contact} maxLength={50}
          onChange={(e) => setContact(e.target.value)}
          className={`w-full bg-transparent border-b text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/15 ${contactRequired && !contact.trim() ? 'border-[#C5A059]/40 focus:border-[#C5A059]/70' : 'border-brand-gray/15 focus:border-brand-white/40'}`}
          style={{ minHeight: '44px' }}
        />
      </div>

      <div className="w-full h-px bg-brand-gray/10" />

      {/* Quick replies */}
      <div className="flex flex-col gap-2 animate-stagger-3">
        <p className="font-ui text-xs text-brand-gray/25 tracking-[0.2em] uppercase">Réponse rapide</p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Belle audace.',       symbol: '✦' },
            { label: "J'aime la démarche.", symbol: '◈' },
            { label: "Envoyer un clin d'œil 👁", symbol: '', value: '👁' },
          ].map((r) => (
            <button key={r.label} disabled={sending}
              onClick={() => sendMessage(r.value || r.label, true)}
              className="w-full py-3 px-4 border border-brand-gray/15 text-left font-ui text-sm font-light tracking-[0.1em] flex items-center gap-3 transition-all rounded-[1px] hover:border-brand-gray/40 hover:bg-brand-white/5 disabled:opacity-40"
              style={{ minHeight: '44px' }}
            >
              {r.symbol && <span style={{ fontSize: '14px', opacity: 0.4 }}>{r.symbol}</span>}
              <span className="text-brand-gray/70">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className="font-ui text-xxs text-brand-gray/20 tracking-[0.15em] uppercase">ou</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>

      {/* Message libre */}
      <div className="flex flex-col gap-3 animate-stagger-4">
        <div className="flex flex-col gap-1">
          <label className="font-ui text-xs text-brand-gray/25 tracking-[0.2em] uppercase">Message libre</label>
          <textarea rows={4} placeholder="Quelque chose vous a traversé l'esprit..." value={message}
            maxLength={1000} onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/15 focus:border-brand-white/40 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors resize-none placeholder:text-brand-gray/20 leading-relaxed"
          />
          <div className="flex justify-end">
            <span className="font-ui text-xxs text-brand-gray/20 tabular-nums">{1000 - message.length}</span>
          </div>
        </div>
        {error && <p className="font-ui text-sm text-red-400 text-center">{error}</p>}
        <button onClick={() => sendMessage(message)} disabled={!message.trim() || sending}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ minHeight: '44px' }}
        >
          {sending ? 'Envoi...' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}

export default function MessagePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-6">
        <Suspense fallback={null}><MessageForm /></Suspense>
        <Link href="/"
          className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          ← retour
        </Link>
      </div>
    </main>
  );
}
