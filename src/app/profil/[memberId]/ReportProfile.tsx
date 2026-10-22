'use client';

// « Signaler ce profil » : ouvert à tous, sans compte (règlement européen sur les
// services numériques : tout hébergeur offre un moyen simple de signaler un
// contenu). Le signalement part à l'équipe, qui décide (cf. /api/profile/report).

import React, { useState } from 'react';

export default function ReportProfile({ memberId }: { memberId: string }) {
  const [open, setOpen]       = useState(false);
  const [reason, setReason]   = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) { setError('Décrivez le problème en quelques mots.'); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/profile/report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memberId, reason: reason.trim(), contact: contact.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Erreur lors de l’envoi.');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="font-ui text-xs text-brand-gray/60 text-center leading-relaxed py-2">
        Merci. Votre signalement a été transmis à l&apos;équipe.
      </p>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-2"
        style={{ minHeight: '44px' }}>
        Signaler ce profil
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full flex flex-col gap-3 text-left animate-fade-in">
      <label htmlFor="report-reason" className="font-ui text-xs text-brand-gray/60 tracking-[0.2em] uppercase">
        Signaler ce profil
      </label>
      <textarea id="report-reason" rows={3} maxLength={1000} value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Que se passe-t-il ?"
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-3 outline-none transition-colors placeholder:text-brand-gray/45 rounded-[2px] resize-none"
      />
      <p id="report-contact-hint" className="font-ui text-xs text-brand-gray/60 leading-relaxed">
        Facultatif : votre email ou @instagram, pour que l&apos;équipe puisse vous répondre.
      </p>
      <input type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" maxLength={200} value={contact}
        onChange={(e) => setContact(e.target.value)}
        aria-label="Votre email ou @instagram (facultatif)" aria-describedby="report-contact-hint"
        placeholder="Email ou @instagram"
        className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/45"
        style={{ minHeight: '44px' }}
      />
      {error && <p role="alert" className="font-ui text-xs text-red-400 leading-relaxed">{error}</p>}
      <button type="submit" disabled={sending}
        className="w-full py-3 border border-brand-white/30 font-ui text-xs tracking-[0.2em] uppercase hover:border-brand-white/60 transition-colors rounded-[1px] disabled:opacity-40"
        style={{ minHeight: '44px' }}>
        {sending ? 'Envoi...' : 'Envoyer le signalement'}
      </button>
    </form>
  );
}
