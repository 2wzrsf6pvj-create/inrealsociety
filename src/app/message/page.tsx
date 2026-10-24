'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { openFullPage } from '@/lib/full-page';
import { captureEvent } from '@/lib/posthog-client';
import { isValidEmail, isInstagramHandle, isValidFirstName } from '@/lib/validators';
import { haptic } from '@/lib/haptics';
import SunToggle from '@/app/components/ui/SunToggle';
import ScreenTitle from '@/app/components/ui/ScreenTitle';
import { BANNED_DEVICE_NOTICE, MODERATION_REFUSAL_NOTICE } from '@/lib/constants';
import { isOffline, offlineMessage, requestErrorMessage, SEND_TIMEOUT_MS, timeoutSignal } from '@/lib/request';
import { useDraft } from '@/lib/use-draft';
import { shopFromProfile } from '@/lib/scan-origin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Conversion scanneur → porteur. Le scanneur vient de vivre le moment fort
// (signal envoyé / profil très demandé / fenêtre ratée) : c'est l'instant idéal
// pour retourner la perspective (« et si c'était toi qu'on scannait ? ») et le
// pousser vers la boutique. Vue + clic sont trackés pour mesurer la boucle.
// shopHref : /shop?from=<porteur> hors aperçu → l'achat garde son origine (063).
function BecomeWearerCTA({ source, hook, shopHref }: { source: string; hook: React.ReactNode; shopHref: string }) {
  const router = useRouter();

  // Note : en dev, React StrictMode double-invoque cet effet → 2 events. Sans
  // effet en prod (mount unique, `source` stable par état terminal). Dédup côté
  // PostHog si besoin.
  useEffect(() => {
    captureEvent('wearer_cta_viewed', { source });
  }, [source]);

  const goShop = () => {
    captureEvent('wearer_cta_clicked', { source });
    router.push(shopHref);
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <p className="font-ui text-xxs text-brand-gray/55 tracking-[0.25em] uppercase">Et toi&nbsp;?</p>
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
  // preview=1 → le porteur découvre le flow depuis l'aperçu : envoi désactivé
  // (pas de message à soi-même, pas de fausse donnée).
  const isPreview = searchParams.get('preview') === '1';
  const shopHref = memberId && !isPreview ? shopFromProfile(memberId) : '/shop';

  // Gardé si la page se recharge (réseau qui flanche), effacé à l'envoi.
  const [message, setMessage, clearDraft] = useDraft(`draft:message:${memberId}`);
  const [contact, setContact]     = useState('');
  // Prénom optionnel — humanise le signal côté porteur. Pré-rempli depuis le
  // nom déjà connu (saisi sur /unlock ou lors d'un précédent message), persisté
  // à l'envoi pour personnaliser le profil au retour.
  const [senderName, setSenderName] = useState('');
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState('');
  const [moderated, setModerated] = useState(false);
  const [banned, setBanned]       = useState(false);
  const [expired, setExpired]     = useState(false);
  const [windowHours, setWindowHours] = useState(24);
  const [limitReached, setLimitReached] = useState(false);
  const [conversationUrl, setConversationUrl] = useState<string | null>(null);
  // Email laissé en contact : un lien de confirmation vient de partir (double opt-in).
  const [verifyEmailSent, setVerifyEmailSent] = useState(false);
  const [copied, setCopied]       = useState(false);
  // Membre en pause OU device bloqué : le serveur renvoie le même code 'paused'
  // (volontaire — ne pas révéler le blocage). Écran terminal neutre.
  const [unavailable, setUnavailable] = useState(false);
  // §4 — Ce device a déjà envoyé son message unique à ce porteur. Écran terminal
  // qui renvoie vers la conversation existante si on en a le lien (localStorage).
  const [alreadyMessaged, setAlreadyMessaged] = useState(false);
  // Ref pour guider (focus) vers le champ contact quand il est requis mais vide —
  // évite le dead-end quand on tape une quick-reply sans contact obligatoire.
  const contactRef = useRef<HTMLInputElement>(null);

  // Pré-remplit le prénom depuis un nom déjà connu (scan précédent / /unlock).
  useEffect(() => {
    const saved = localStorage.getItem('scannerName');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prénom mémorisé, lu après l'hydratation
    if (saved) setSenderName(saved);
  }, []);

  const sendMessage = async (content: string, isQuickReply = false) => {
    if (!content.trim() || !memberId) return;
    // Aperçu (porteur) : on ne poste rien.
    if (isPreview) {
      setError('Aperçu — l’envoi est désactivé. C’est ici qu’un scanneur vous écrirait.');
      return;
    }
    // Garde client : si un contact est exigé et absent, on évite le roundtrip ET
    // on guide vers le champ (focus + scroll) au lieu d'un message d'erreur sec.
    if (contactRequired && !contact.trim()) {
      setError('Ce membre demande un @instagram ou un email pour pouvoir vous répondre.');
      contactRef.current?.focus();
      contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Le texte tapé reste dans le champ (et dans le brouillon) : on le dit.
    const kept = isQuickReply ? undefined : 'Votre message est gardé.';
    if (isOffline()) { setError(offlineMessage(kept)); return; }
    setSending(true);
    setError('');
    haptic('light'); // accusé de réception tactile du tap d'envoi
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Réseau qui stagne : abandon, puis un nouvel essai sans risque de doublon
        // (appareil reconnu dès l'ouverture du formulaire, cf. proxy).
        signal: timeoutSignal(SEND_TIMEOUT_MS),
        body: JSON.stringify({
          memberId,
          content:       content.trim(),
          senderContact: contact.trim() || null,
          senderName:    senderName.trim() || null,
          isQuickReply,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Erreur lors de l’envoi.';
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
          contactRef.current?.focus();
          contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setSending(false); return;
        }
        if (data.code === 'paused') {
          captureEvent('message_blocked_paused', { member_id: memberId });
          setUnavailable(true); setSending(false); return;
        }
        if (data.code === 'banned') {
          captureEvent('message_blocked_banned', { member_id: memberId });
          setBanned(true); setSending(false); return;
        }
        if (data.code === 'already_messaged') {
          captureEvent('message_blocked_already_messaged', { member_id: memberId });
          // Le serveur renvoie la conversation de ce device ; à défaut, le lien
          // gardé en localStorage. Assaini à la SOURCE : on ne garde que le chemin
          // interne (même origine), comme ProfilClient. Évite toute redirection
          // hors-app même si la valeur localStorage était altérée. Les usages en
          // aval poussent le chemin tel quel.
          const prior = localStorage.getItem(`conversation_${memberId}`);
          if (typeof data.conversationId === 'string' && UUID_RE.test(data.conversationId)) {
            const convPath = `/conversation/${data.conversationId}`;
            setConversationUrl(convPath);
            // Réponse au premier envoi perdue (réseau) : l'appareil retient sa
            // conversation, comme après un envoi réussi (lien sur le profil).
            localStorage.setItem(`conversation_${memberId}`, `${window.location.origin}${convPath}`);
          } else if (prior) {
            try {
              const u = new URL(prior, window.location.origin);
              if (u.origin === window.location.origin) setConversationUrl(u.pathname + u.search);
            } catch { /* valeur corrompue → ignorée */ }
          }
          // Ce formulaire n'enverra plus rien à ce porteur : brouillon effacé.
          clearDraft();
          setAlreadyMessaged(true); setSending(false); return;
        }
        throw new Error(errorMsg);
      }
      if (data.moderated) { setModerated(true); setSending(false); return; }

      captureEvent('message_submitted', {
        member_id:     memberId,
        is_quick_reply: isQuickReply,
        has_contact:    !!contact.trim(),
        has_name:       !!senderName.trim(),
      });

      // Persiste le prénom (formaté) → personnalise le profil au retour et
      // pré-remplit un prochain message.
      const cleanName = senderName.trim();
      if (cleanName && isValidFirstName(cleanName)) {
        const formatted = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        localStorage.setItem('scannerName', formatted);
      }

      // conversationUrl porte un CHEMIN interne (cohérent avec l'assainissement à la
      // relecture localStorage) → openFullPage reçoit toujours un path, jamais une URL
      // absolue. Le localStorage garde l'URL complète (relue + assainie en amont).
      const convPath = `/conversation/${data.messageId}`;
      localStorage.setItem(`conversation_${memberId}`, `${window.location.origin}${convPath}`);
      setVerifyEmailSent(data.contactVerification === 'sent');
      setConversationUrl(convPath);
      clearDraft();
      haptic('success'); // signal envoyé — confirmation tactile du moment clé

    } catch (err) {
      setError(requestErrorMessage(err, 'Une erreur est survenue. Réessayez.', kept));
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!conversationUrl) return;
    try {
      await navigator.clipboard.writeText(conversationUrl);
      setCopied(true);
      haptic('light');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé / vieux navigateur) : no-op.
    }
  };

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <p className="font-display text-2xl font-light">Ce moment est passé.</p>
        <p className="font-ui text-sm text-brand-gray/65 leading-relaxed">
          La fenêtre de {windowHours} heures est terminée.<br />
          La prochaine occasion sera la bonne.
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <BecomeWearerCTA source="window_expired" shopHref={shopHref} hook={<>La prochaine fois,<br />sois de l’autre côté.</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-sm text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
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
        <ScreenTitle className="font-display text-2xl font-light">{memberName} a déjà du monde autour.</ScreenTitle>
        <p className="font-ui text-sm text-brand-gray/65 leading-relaxed">
          Cette personne attire l’attention.<br />
          Ses conversations en cours sont au complet.
        </p>
        <p className="font-ui text-xxs text-brand-gray/55 leading-relaxed">
          Revenez plus tard, ou croisez-la à nouveau.
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <BecomeWearerCTA source="conversation_limit" shopHref={shopHref} hook={<>Toi aussi,<br />fais tourner les têtes.</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-sm text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
          style={{ minHeight: '44px' }}>
          ← retour au profil
        </button>
      </div>
    );
  }

  if (banned) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <ScreenTitle className="font-display text-2xl font-light">Vous ne pouvez plus écrire.</ScreenTitle>
        <p className="font-ui text-sm text-brand-gray/65 leading-relaxed">
          {BANNED_DEVICE_NOTICE}
        </p>
        <button onClick={() => router.push('/')}
          className="font-ui text-sm text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
          style={{ minHeight: '44px' }}>
          ← retour
        </button>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <ScreenTitle className="font-display text-2xl font-light">{memberName} est indisponible.</ScreenTitle>
        <p className="font-ui text-sm text-brand-gray/65 leading-relaxed">
          Cette personne ne reçoit pas de message pour le moment.<br />
          Peut-être une prochaine fois.
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <BecomeWearerCTA source="paused" shopHref={shopHref} hook={<>Et toi,<br />tu te montrerais&nbsp;?</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-sm text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
          style={{ minHeight: '44px' }}>
          ← retour au profil
        </button>
      </div>
    );
  }

  if (alreadyMessaged) {
    return (
      <div className="flex flex-col items-center gap-6 text-center animate-stagger-1">
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        <ScreenTitle className="font-display text-2xl font-light">C’est déjà lancé.</ScreenTitle>
        <p className="font-ui text-sm text-brand-gray/65 leading-relaxed">
          Vous avez déjà écrit à {memberName}.<br />
          La suite se passe dans votre conversation.
        </p>
        <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
        {conversationUrl && (
          <button onClick={() => openFullPage(conversationUrl)}
            className="w-full max-w-xs py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all"
            style={{ minHeight: '44px' }}>
            Voir la conversation
          </button>
        )}
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-sm text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-3"
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
          <span aria-hidden="true" className="font-display text-xl text-red-400/60">!</span>
        </div>
        <ScreenTitle className="font-display text-2xl font-light">Ce message ne peut pas être envoyé.</ScreenTitle>
        <p className="font-ui text-sm text-brand-gray/65 leading-relaxed">
          {MODERATION_REFUSAL_NOTICE}
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
          <span aria-hidden="true" style={{ fontSize: '16px' }}>✦</span>
        </div>
        <div className="flex flex-col gap-3">
          <ScreenTitle className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">Signal envoyé.</ScreenTitle>
          <p className="font-ui text-sm font-light text-brand-gray/65 leading-relaxed">
            {memberName} peut vous répondre directement ici.
          </p>
          {verifyEmailSent && (
            <p className="font-ui text-xs text-[#C5A059]/85 leading-relaxed">
              Pour recevoir sa réponse par email, confirmez votre adresse&nbsp;: nous venons de vous écrire.
            </p>
          )}
        </div>
        <div className="w-full flex flex-col gap-3">
          <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Votre fil de conversation</p>
          <button onClick={() => openFullPage(conversationUrl)}
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
          <p className="font-ui text-xxs md:text-xs text-brand-gray/65 leading-relaxed">
            Ce lien est sauvegardé automatiquement.<br />Vous le retrouverez sur le profil de {memberName}.
          </p>
        </div>
        <div className="w-full h-px bg-brand-gray/10" />
        <BecomeWearerCTA source="message_sent" shopHref={shopHref} hook={<>Et si c’était toi<br />qu’on scannait&nbsp;?</>} />
        <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
          className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray transition-colors py-2"
          style={{ minHeight: '44px' }}>
          ← retour au profil
        </button>
      </div>
    );
  }

  // Le contact "ressemble" à un email OU un @handle (avec ou sans @ tapé) — vide =
  // ok (champ optionnel sauf si requis, géré par le garde de sendMessage).
  const _c = contact.trim();
  const contactLooksValid = _c === '' || isValidEmail(_c) || isInstagramHandle(_c) || isInstagramHandle('@' + _c);
  // Même règle que le serveur : un prénom hors format y est ignoré (message anonyme).
  const nameLooksValid = senderName.trim() === '' || isValidFirstName(senderName.trim());

  // Prénom et contact, en tête du formulaire (cf. plus bas).
  const nameField = (
    <div className="flex flex-col gap-1">
      <label htmlFor="msg-name" className="font-ui text-xs text-brand-gray/60 tracking-[0.2em] uppercase">
        Votre prénom{' '}
        <span className="normal-case tracking-normal ml-1 text-brand-white/60">(optionnel)</span>
      </label>
      <p id="msg-name-hint" className="font-ui text-xs text-brand-gray/65 leading-relaxed mb-1">
        Pour que {memberName} sache qui lui écrit. Sinon, vous restez anonyme.
      </p>
      <input id="msg-name" aria-describedby="msg-name-hint" type="text" placeholder="Anonyme par défaut" value={senderName} maxLength={30}
        autoComplete="given-name"
        onChange={(e) => setSenderName(e.target.value)}
        className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/55"
        style={{ minHeight: '44px' }}
      />
      {!nameLooksValid && (
        <p className="font-ui text-xs text-[#C5A059]/85 leading-relaxed mt-1 animate-fade-in">
          Lettres uniquement&nbsp;: sinon, votre message partira en anonyme.
        </p>
      )}
    </div>
  );

  const contactField = (
    <div className="flex flex-col gap-1">
      <label htmlFor="msg-contact" className="font-ui text-xs text-brand-gray/60 tracking-[0.2em] uppercase">
        Votre @instagram ou email{' '}
        <span className={`normal-case tracking-normal ml-1 ${contactRequired ? 'text-[#C5A059]' : 'text-brand-white/60'}`}>
          ({contactRequired ? 'requis' : 'recommandé'})
        </span>
      </label>
      <p id="msg-contact-hint" className="font-ui text-xs text-brand-gray/65 leading-relaxed mb-1">
        {contactRequired
          ? 'Ce membre n’accepte que les messages avec un contact.'
          : `Sans contact, vous ne saurez pas quand ${memberName} vous répond.`}
      </p>
      <input id="msg-contact" aria-describedby="msg-contact-hint" ref={contactRef} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off"
        placeholder={contactRequired ? '@instagram ou email' : 'Anonyme par défaut'} value={contact} maxLength={200}
        onChange={(e) => setContact(e.target.value)}
        className={`w-full bg-transparent border-b text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/55 ${contactRequired && !contact.trim() ? 'border-[#C5A059]/50 focus:border-[#C5A059]' : 'border-brand-gray/20 focus:border-brand-white/50'}`}
        style={{ minHeight: '44px' }}
      />
      {/* Validation douce (non bloquante) : alerte si ça ne ressemble ni à un email
          ni à un @handle — un contact mal tapé = le porteur ne peut pas répondre. */}
      {!contactLooksValid && (
        <p className="font-ui text-xs text-[#C5A059]/85 leading-relaxed mt-1 animate-fade-in">
          Cela ne ressemble pas à un @instagram ou un email&nbsp;: vérifiez-le pour ne pas manquer sa réponse.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="text-center flex flex-col gap-2 animate-stagger-1">
        <h1 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">Un signal discret.</h1>
        <p className="font-ui text-sm font-light text-brand-gray/65 leading-relaxed">À {memberName}, qui pourra vous répondre directement.</p>
        <p className="font-ui text-xxs text-brand-gray/50 leading-relaxed">
          Réservé aux 18 ans et plus&nbsp;: en envoyant un message, vous confirmez avoir l’âge requis.{' '}
          <Link href="/confidentialite" className="underline underline-offset-2 hover:text-brand-white/80 transition-colors">
            Vos données
          </Link>
        </p>
      </div>

      {isPreview && (
        <div className="w-full bg-[#0a0a08] border border-[#C5A059]/25 rounded-[2px] px-4 py-3 flex flex-col gap-1 text-center">
          <p className="font-ui text-xxs text-[#C5A059]/85 tracking-[0.18em] uppercase"><span aria-hidden="true">✦ </span>Aperçu</p>
          <p className="font-ui text-xs text-brand-gray/65 leading-relaxed">
            Voici le formulaire qu’un scanneur remplit pour vous écrire. L’envoi est désactivé ici.
          </p>
        </div>
      )}

      {/* Prénom et contact AVANT tout envoi : les réponses rapides partent en un
          tap, et sans contact le passant ne sait pas quand on lui répond. */}
      <div className="flex flex-col gap-5 animate-stagger-2">
        {nameField}
        {contactField}
      </div>

      {/* Réponse rapide — chemin 1-tap, mis en avant EN PREMIER (friction minimale). */}
      <div className="flex flex-col gap-2 animate-stagger-2">
        <p className="font-ui text-xs text-brand-gray/60 tracking-[0.2em] uppercase">Réponse rapide</p>
        {contactRequired && !contact.trim() && (
          <p className="font-ui text-xs text-[#C5A059]/85 leading-relaxed">Renseignez d’abord un contact ci-dessus.</p>
        )}
        <div className="flex flex-col gap-2">
          {[
            { label: 'Belle audace.',       symbol: '✦' },
            { label: "J’aime la démarche.", symbol: '◈' },
            // Le symbole, sans emoji en couleur ; le message envoyé reste « 👁 ».
            { label: "Envoyer un clin d’œil", symbol: '◉', value: '👁' },
          ].map((r) => (
            <button key={r.label} disabled={sending || isPreview}
              onClick={() => sendMessage(r.value || r.label, true)}
              className="w-full py-3 px-4 border border-brand-gray/20 text-left font-ui text-sm font-light tracking-[0.1em] flex items-center gap-3 transition-all rounded-[1px] hover:border-brand-gray/45 hover:bg-brand-white/5 disabled:opacity-40"
              style={{ minHeight: '44px' }}
            >
              {r.symbol && <span aria-hidden="true" style={{ fontSize: '14px', opacity: 0.5 }}>{r.symbol}</span>}
              <span className="text-brand-white/80">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase">ou un mot à vous</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>

      {/* Message libre */}
      <div className="flex flex-col gap-3 animate-stagger-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="msg-content" className="font-ui text-xs text-brand-gray/60 tracking-[0.2em] uppercase">Message libre</label>
          <textarea id="msg-content" rows={4} placeholder="Quelque chose vous a traversé l’esprit…" value={message}
            maxLength={1000} onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors resize-none placeholder:text-brand-gray/55 leading-relaxed"
          />
          <div className="flex justify-end">
            <span className="font-ui text-xxs text-brand-gray/55 tabular-nums">{1000 - message.length}</span>
          </div>
        </div>
        {error && <p className="animate-fade-in font-ui text-sm text-red-400 text-center" role="alert">{error}</p>}
        <button onClick={() => sendMessage(message)} disabled={!message.trim() || sending || isPreview}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ minHeight: '44px' }}
        >
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>

      <button onClick={() => memberId ? router.push(`/profil/${memberId}`) : router.push('/')}
        className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-3 self-center"
        style={{ minHeight: '44px' }}>
        ← retour au profil
      </button>
    </div>
  );
}

export default function MessagePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <SunToggle />
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-6">
        <Suspense fallback={
          <div className="flex flex-col items-center gap-3 py-12 animate-pulse">
            <div className="w-12 h-12 rounded-full border border-brand-white/15 flex items-center justify-center">
              <span aria-hidden="true" style={{ fontSize: '16px', opacity: 0.5 }}>✦</span>
            </div>
            <p className="font-ui text-xxs text-brand-gray/55 tracking-[0.25em] uppercase">Un instant</p>
          </div>
        }><MessageForm /></Suspense>
      </div>
    </main>
  );
}
