'use client';
// Bouton de décision de /admin : demande le motif quand il en faut un, envoie à
// /api/admin/moderation, puis dit qui a été prévenu. La liste se met à jour au
// rechargement (« Actualiser »), pour que le résultat reste lisible.

import React, { useId, useState } from 'react';
import { requestErrorMessage, SEND_TIMEOUT_MS, timeoutSignal } from '@/lib/request';
import { formatDayFr } from '@/lib/dates';

export default function AdminAction({ label, payload, ask, notifyReporter = false, danger = false }: {
  label:   string;
  /** action + identifiants (+ reportKey quand la décision part d'un signalement). */
  payload: Record<string, string>;
  /** Texte à saisir : motif de la décision, ou décision qui clôt un signalement. */
  ask?:    { field: 'motif' | 'decision'; label: string };
  /** Proposer de prévenir l'auteur du signalement (s'il a laissé un email). */
  notifyReporter?: boolean;
  danger?: boolean;
}) {
  const id = useId();
  const [open, setOpen]     = useState(false);
  const [text, setText]     = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState('');
  const [error, setError]   = useState('');

  const button = `px-3 py-2 border font-ui text-xxs tracking-[0.15em] uppercase rounded-[1px] transition-colors disabled:opacity-40 ${
    danger ? 'border-red-400/40 text-red-300/90 hover:border-red-300' : 'border-brand-white/30 hover:border-brand-white/60'
  }`;

  const send = async () => {
    if (ask && text.trim().length < 3) { setError('Trois caractères au moins.'); return; }
    if (!ask && !window.confirm(`${label} ?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/moderation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...payload,
          ...(ask ? { [ask.field]: text.trim() } : {}),
          ...(notifyReporter ? { notifyReporter: notify } : {}),
        }),
        signal:  timeoutSignal(SEND_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Erreur ${res.status}`);
      // true : prévenu ; false : pas d'adresse ou envoi impossible ; null : sans objet.
      setResult([
        'Fait.',
        data.memberNotified === true  ? 'Porteur prévenu par email.' : '',
        data.memberNotified === false ? 'Porteur non prévenu (pas d’adresse ou envoi impossible)\u00a0: le prévenir à la main.' : '',
        data.reporterNotified === true  ? 'Auteur du signalement prévenu.' : '',
        data.reporterNotified === false ? 'Auteur du signalement non prévenu\u00a0: pas d’email laissé, ou envoi impossible.' : '',
        data.buyerNotified === true  ? 'Code renvoyé par email.' : '',
        data.buyerNotified === false ? 'Code non envoyé\u00a0: envoi impossible, réessayer plus tard.' : '',
        typeof data.premiumUntil === 'string' ? `Premium offert jusqu’au ${formatDayFr(data.premiumUntil)}.` : '',
      ].filter(Boolean).join(' '));
    } catch (err) {
      setError(requestErrorMessage(err, 'Erreur.'));
    } finally {
      setBusy(false);
    }
  };

  if (result) return <p role="status" className="font-ui text-xs text-brand-gray/70">{result}</p>;

  if (!ask) {
    return (
      <span className="flex flex-col gap-1">
        <button type="button" onClick={send} disabled={busy} className={button} style={{ minHeight: '44px' }}>
          {busy ? '…' : label}
        </button>
        {error && <span role="alert" className="font-ui text-xs text-red-400">{error}</span>}
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={button} style={{ minHeight: '44px' }}>
        {label}
      </button>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <label htmlFor={id} className="font-ui text-xs text-brand-gray/60">{ask.label}</label>
      <textarea id={id} rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
        className="w-full bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base p-2 outline-none rounded-[2px] resize-none" />
      {notifyReporter && (
        <label className="flex items-start gap-2 font-ui text-xs text-brand-gray/60">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#C5A059]" />
          Prévenir l’auteur du signalement, s’il a laissé un email
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={send} disabled={busy} className={button} style={{ minHeight: '44px' }}>
          {busy ? 'Envoi…' : label}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(''); }}
          className="px-3 py-2 font-ui text-xxs tracking-[0.15em] uppercase text-brand-gray/60 underline underline-offset-4"
          style={{ minHeight: '44px' }}>
          Annuler
        </button>
      </div>
      {error && <p role="alert" className="font-ui text-xs text-red-400">{error}</p>}
    </div>
  );
}
