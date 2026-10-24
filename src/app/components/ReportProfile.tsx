'use client';
// « Signaler ce profil » ou « Signaler cette conversation » : ouvert à tous,
// sans compte (règlement européen sur les services numériques, art. 16). Le
// signalement part à l'équipe, qui décide (cf. /api/profile/report). Avec un
// email, son auteur reçoit un accusé de réception, puis la décision.
import React, { useState } from 'react';
import { isOffline, offlineMessage, requestErrorMessage, SEND_TIMEOUT_MS, timeoutSignal } from '@/lib/request';

export default function ReportProfile({ memberId, messageId }: {
  memberId:   string;
  /** Signalement depuis une conversation (passant) : elle est jointe à l'alerte. */
  messageId?: string;
}) {
  const [open, setOpen]           = useState(false);
  const [reason, setReason]       = useState('');
  const [contact, setContact]     = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [sending, setSending]     = useState(false);
  const [sent, setSent]           = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [error, setError]         = useState('');
  const label = messageId ? 'Signaler cette conversation' : 'Signaler ce profil';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) { setError('Décrivez le problème en quelques mots.'); return; }
    if (!goodFaith) { setError('Cochez la case pour confirmer votre signalement.'); return; }
    if (isOffline()) { setError(offlineMessage('Votre texte est gardé.')); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/profile/report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memberId, messageId, reason: reason.trim(), contact: contact.trim() || null, goodFaith }),
        signal:  timeoutSignal(SEND_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Erreur lors de l’envoi.');
      setReceiptSent(data.receiptSent === true);
      setSent(true);
    } catch (err) {
      setError(requestErrorMessage(err, 'Erreur lors de l’envoi.', 'Votre texte est gardé.'));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="font-ui text-xs text-brand-gray/60 text-center leading-relaxed py-2">
        Merci. Votre signalement a été transmis à l&apos;équipe.
        {receiptSent && <> Un accusé de réception vous a été envoyé par email.</>}
      </p>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-2"
        style={{ minHeight: '44px' }}>
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full flex flex-col gap-3 text-left animate-fade-in">
      <label htmlFor="report-reason" className="font-ui text-xs text-brand-gray/60 tracking-[0.2em] uppercase">
        {label}
      </label>
      <p className="font-ui text-xs text-brand-gray/60 leading-relaxed">
        Une personne est en danger ? Appelez le 17 ou le 112.
      </p>
      <textarea id="report-reason" rows={3} maxLength={1000} value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Que se passe-t-il ?"
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-3 outline-none transition-colors placeholder:text-brand-gray/55 rounded-[2px] resize-none"
      />
      <p id="report-contact-hint" className="font-ui text-xs text-brand-gray/60 leading-relaxed">
        Facultatif : votre email, pour recevoir un accusé de réception puis la décision de l&apos;équipe,
        ou votre @instagram.
      </p>
      <input type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" maxLength={200} value={contact}
        onChange={(e) => setContact(e.target.value)}
        aria-label="Votre email ou @instagram (facultatif)" aria-describedby="report-contact-hint"
        placeholder="Email ou @instagram"
        className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/55"
        style={{ minHeight: '44px' }}
      />
      <label htmlFor="report-good-faith" className="flex items-start gap-3 cursor-pointer py-1">
        <input
          id="report-good-faith"
          type="checkbox"
          checked={goodFaith}
          onChange={(e) => { setGoodFaith(e.target.checked); setError(''); }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#C5A059] cursor-pointer"
        />
        <span className="font-ui text-xs text-brand-gray/60 leading-relaxed">
          Je fais ce signalement de bonne foi : à ma connaissance, ce que j&apos;indique est exact et complet.
        </span>
      </label>
      {error && <p role="alert" className="font-ui text-xs text-red-400 leading-relaxed">{error}</p>}
      <button type="submit" disabled={sending}
        className="w-full py-3 border border-brand-white/30 font-ui text-xs tracking-[0.2em] uppercase hover:border-brand-white/60 transition-colors rounded-[1px] disabled:opacity-40"
        style={{ minHeight: '44px' }}>
        {sending ? 'Envoi...' : 'Envoyer le signalement'}
      </button>
    </form>
  );
}
