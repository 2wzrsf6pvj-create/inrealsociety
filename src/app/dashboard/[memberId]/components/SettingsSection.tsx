'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { captureEvent, resetIdentity } from '@/lib/posthog-client';
import type { Member } from '@/lib/types';
import SectionDivider from '@/app/components/ui/SectionDivider';

// ─── Premium Block ────────────────────────────────────────────────────────────

function PremiumBlock({ member }: { member: Member }) {
  const [loading, setLoading] = useState(false);
  const isPremium = member.plan === 'premium';

  const handleAction = async () => {
    setLoading(true);
    if (!isPremium) {
      captureEvent('upgrade_clicked', { member_id: member.id, plan: 'free', source: 'settings_premium_block' });
    }
    try {
      const endpoint = isPremium ? '/api/subscription/portal' : '/api/subscription/checkout';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // ignore
    }
    setLoading(false);
  };

  React.useEffect(() => {
    if (!isPremium) {
      captureEvent('upgrade_cta_viewed', { member_id: member.id, plan: 'free', source: 'settings_premium_block' });
    }
  }, [isPremium, member.id]);

  return (
    <div className={`w-full border rounded-[2px] p-4 flex flex-col gap-3 ${isPremium ? 'bg-[#0a0a08] border-[#C5A059]/20' : 'bg-[#080808] border-brand-gray/10'}`}>
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className={`font-ui text-xs tracking-[0.18em] uppercase ${isPremium ? 'text-[#C5A059]/60' : 'text-brand-gray/30'}`}>
          {isPremium ? '✦ premium actif' : 'premium'}
        </span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>

      {isPremium ? (
        <div className="flex flex-col gap-2">
          <p className="font-ui text-xs md:text-sm text-brand-gray/50 leading-relaxed">
            Vous bénéficiez de la fenêtre 48h, des conversations illimitées et du badge ✦ sur votre profil.
          </p>
          <button onClick={handleAction} disabled={loading}
            className="w-full py-2.5 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/40 hover:border-brand-gray/30 hover:text-brand-gray/60 transition-colors rounded-[2px] disabled:opacity-40">
            {loading ? 'Chargement...' : 'Gérer mon abonnement'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {[
              'Fenêtre scanner étendue à 48h (au lieu de 24h)',
              'Conversations illimitées (au lieu de 3)',
              'Badge ✦ visible sur votre profil',
              'Stats avancées à venir',
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="font-ui text-xs text-[#C5A059]/50 mt-0.5">✦</span>
                <span className="font-ui text-xs text-brand-gray/50">{item}</span>
              </div>
            ))}
          </div>
          <button onClick={handleAction} disabled={loading}
            className="animate-shimmer w-full py-3 bg-[#C5A059] text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-[#d4af6a] active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
            {loading ? 'Chargement...' : 'Passer premium — 2,99€/mois'}
          </button>
          <p className="font-ui text-xxs text-brand-gray/20 text-center">
            Sans engagement · Annulable à tout moment
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Referral Block ───────────────────────────────────────────────────────────

function ReferralBlock({ memberId }: { memberId: string }) {
  const [count,     setCount]     = useState<number | null>(null);
  const [converted, setConverted] = useState<number>(0);
  const [copied,    setCopied]    = useState(false);
  // Lien vers la page d'invitation brandée /join/<id> (qui pose le ref puis
  // envoie au shop). memberId = UUID, l'identifiant de parrainage unifié.
  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${memberId}`
    : '';

  React.useEffect(() => {
    fetch(`/api/referral?memberId=${memberId}`)
      .then(r => r.json())
      .then(d => { setCount(d.count ?? 0); setConverted(d.converted ?? 0); })
      .catch(() => {});
  }, [memberId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
      <SectionDivider label="parrainage" />
      <p className="font-ui text-xs md:text-sm text-brand-gray/50 leading-relaxed">
        Partagez votre lien. Chaque personne qui commande via ce lien bénéficie d&apos;une remise — vous, vous suivez vos parrainages ici.
      </p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-brand-gray/40 break-all flex-1 leading-relaxed">{referralUrl}</p>
        <button onClick={handleCopy} className="font-ui text-xs text-brand-white/60 hover:text-brand-white transition-colors flex-shrink-0 px-2 py-1 border border-brand-gray/20 rounded-[2px] min-w-[58px]">
          {copied ? (
            <span key="copied" className="animate-success inline-flex items-center gap-1 text-green-400/70">
              <span aria-hidden>✓</span> Copié
            </span>
          ) : (
            <span>Copier</span>
          )}
        </button>
      </div>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          onClick={() => navigator.share({ title: 'In Real Society', text: 'Rejoins le club.', url: referralUrl }).catch(() => {})}
          className="w-full py-2.5 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/40 hover:border-brand-gray/30 hover:text-brand-gray/60 transition-colors rounded-[2px]"
        >
          Partager le lien
        </button>
      )}
      {count !== null && (
        <div className="flex items-center gap-4">
          <p className="font-ui text-xs text-brand-gray/30">
            {count} parrainage{count !== 1 ? 's' : ''}
          </p>
          {converted > 0 && (
            <p className="font-ui text-xs text-green-400/50">
              {converted} achat{converted !== 1 ? 's' : ''} confirmé{converted !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Feedback Block ───────────────────────────────────────────────────────────

function FeedbackBlock({ memberId }: { memberId: string }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'app', message: message.trim(), memberId }),
      });
      if (res.ok) {
        setSent(true);
        setMessage('');
      } else {
        setError("Erreur lors de l'envoi.");
      }
    } catch {
      setError('Erreur réseau.');
    }
    setSending(false);
  };

  return (
    <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
      <SectionDivider label="votre avis" />

      {sent ? (
        <p className="font-ui text-xs text-green-400/60 text-center py-2">
          Merci pour votre retour. Il nous aide à améliorer l&apos;expérience.
        </p>
      ) : (
        <>
          <p className="font-ui text-xxs md:text-xs text-brand-gray/40 leading-relaxed">
            Bug, suggestion, impression — tout retour est précieux.
          </p>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setError(''); }}
            maxLength={2000}
            rows={3}
            placeholder="Votre message..."
            className="w-full bg-transparent border border-brand-gray/15 focus:border-brand-white/30 text-brand-white font-ui font-light text-sm p-3 outline-none transition-colors placeholder:text-brand-gray/15 rounded-[2px] resize-none"
          />
          {error && <p className="font-ui text-xs text-red-400">{error}</p>}
          <button onClick={handleSubmit} disabled={sending || !message.trim()}
            className="w-full py-2.5 bg-brand-white/10 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-white/60 hover:bg-brand-white/15 transition-colors rounded-[2px] disabled:opacity-30 disabled:cursor-not-allowed">
            {sending ? 'Envoi...' : 'Envoyer'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Logout Button ────────────────────────────────────────────────────────────

function LogoutButton() {
  const [confirming, setConfirming] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Réinitialise l'identité PostHog : sinon, sur un device partagé, les events
    // du prochain visiteur seraient attribués à ce membre (distinct_id persisté).
    resetIdentity();
    sessionStorage.removeItem('just_logged_in');
    window.location.href = '/auth/login';
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full py-3 border border-red-500/20 text-center font-ui text-xs font-light tracking-[0.2em] uppercase text-red-400/60 hover:border-red-500/40 hover:text-red-400 transition-colors rounded-[2px]"
      >
        Se déconnecter
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => setConfirming(false)}
        className="flex-1 py-3 border border-brand-gray/20 text-center font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/50 hover:border-brand-gray/40 transition-colors rounded-[2px]">
        Annuler
      </button>
      <button onClick={handleLogout}
        className="flex-1 py-3 border border-red-500/40 text-center font-ui text-xs font-bold tracking-[0.15em] uppercase text-red-400 hover:bg-red-500/10 transition-colors rounded-[2px]">
        Confirmer
      </button>
    </div>
  );
}

// ─── Export RGPD ──────────────────────────────────────────────────────────────

function ExportDataLink() {
  return (
    <a
      href="/api/member/export"
      download
      className="font-ui text-xxs text-brand-gray/25 tracking-[0.1em] underline underline-offset-4 hover:text-brand-gray/60 transition-colors py-2"
    >
      Télécharger mes données (RGPD)
    </a>
  );
}

// ─── Delete Account ───────────────────────────────────────────────────────────

function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/member/delete', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/';
      }
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="font-ui text-xxs text-brand-gray/20 tracking-[0.1em] underline underline-offset-4 hover:text-red-400/50 transition-colors py-2"
      >
        Supprimer mon compte
      </button>
    );
  }

  return (
    <div className="w-full bg-red-500/5 border border-red-500/20 rounded-[2px] p-4 flex flex-col gap-3">
      <p className="font-ui text-xs text-red-400/80 text-center leading-relaxed">
        Cette action est irréversible. Toutes vos données seront supprimées.
      </p>
      <div className="flex gap-2">
        <button onClick={() => setConfirming(false)}
          className="flex-1 py-2.5 border border-brand-gray/20 text-center font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/50 hover:border-brand-gray/40 transition-colors rounded-[2px]">
          Annuler
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="flex-1 py-2.5 bg-red-500/80 text-center font-ui text-xs font-bold tracking-[0.15em] uppercase text-white rounded-[2px] hover:bg-red-500 transition-colors disabled:opacity-50">
          {deleting ? 'Suppression...' : 'Confirmer'}
        </button>
      </div>
    </div>
  );
}

// ─── Settings Section (orchestrator du tab Réglages) ─────────────────────────

export default function SettingsSection({ member }: { member: Member }) {
  const [isPaused,    setIsPaused]    = useState(member.is_paused);
  const [requireContact, setRequireContact] = useState(member.require_contact ?? false);
  const [marketingConsent, setMarketingConsent] = useState(member.marketing_consent ?? false);
  // saved/error sont PAR CHAMP : un succès sur un toggle ne doit pas effacer
  // l'erreur live de l'autre (ni afficher "Sauvegardé" sous le toggle qui a
  // échoué).
  type Field = 'pause' | 'require_contact' | 'marketing';
  const [saving,      setSaving]      = useState(false);
  const [savedField,  setSavedField]  = useState<Field | null>(null);
  const [errorField,  setErrorField]  = useState<{ field: Field; msg: string } | null>(null);

  const updateField = async (field: Field, patch: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setErrorField(e => (e?.field === field ? null : e)); // ne touche que ce champ
    try {
      const res = await fetch('/api/member/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setSavedField(field);
        setTimeout(() => setSavedField(f => (f === field ? null : f)), 2000);
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setErrorField({ field, msg: data.error || `Erreur ${res.status}` });
      return false;
    } catch {
      setErrorField({ field, msg: 'Erreur réseau.' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Toggles optimistes AVEC rollback : si l'update échoue, on remet l'état
  // précédent (sinon l'interrupteur restait basculé alors que rien n'a changé).
  const togglePause = async () => {
    const next = !isPaused;
    setIsPaused(next);
    if (!(await updateField('pause', { is_paused: next }))) setIsPaused(!next);
  };

  const toggleRequireContact = async () => {
    const next = !requireContact;
    setRequireContact(next);
    if (!(await updateField('require_contact', { require_contact: next }))) setRequireContact(!next);
  };

  const toggleMarketing = async () => {
    const next = !marketingConsent;
    setMarketingConsent(next);
    if (!(await updateField('marketing', { marketing_consent: next }))) setMarketingConsent(!next);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Pause profil */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
        <SectionDivider label="visibilité" />

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-sm text-brand-white/80">Mettre en pause</p>
            <p className="font-ui text-xs text-brand-gray/40 leading-relaxed">
              Votre profil sera masqué. Les scanneurs verront &ldquo;Ce membre est indisponible&rdquo;.
            </p>
          </div>
          <button
            onClick={togglePause}
            disabled={saving}
            aria-label={isPaused ? 'Réactiver le profil' : 'Mettre le profil en pause'}
            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${isPaused ? 'bg-red-500/80' : 'bg-brand-gray/20'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPaused ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {savedField === 'pause' && <p className="font-ui text-xs text-green-400/60">Sauvegardé.</p>}
        {errorField?.field === 'pause' && <p className="font-ui text-xs text-red-400">{errorField.msg}</p>}

        <div className="w-full h-px bg-brand-gray/10" />

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-sm text-brand-white/80">Exiger un contact</p>
            <p className="font-ui text-xs text-brand-gray/40 leading-relaxed">
              Seules les personnes qui laissent un @instagram ou un email pourront vous écrire. Filtre les messages anonymes.
            </p>
          </div>
          <button
            onClick={toggleRequireContact}
            disabled={saving}
            aria-label={requireContact ? 'Ne plus exiger un contact' : 'Exiger un contact pour vous écrire'}
            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${requireContact ? 'bg-brand-white/60' : 'bg-brand-gray/20'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${requireContact ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {savedField === 'require_contact' && <p className="font-ui text-xs text-green-400/60">Sauvegardé.</p>}
        {errorField?.field === 'require_contact' && <p className="font-ui text-xs text-red-400">{errorField.msg}</p>}
      </div>

      {/* Communications email (consent marketing — distinct du consent analytics) */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-3">
        <SectionDivider label="communications" />
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-sm text-brand-white/80">Newsletter et actualités</p>
            <p className="font-ui text-xs text-brand-gray/40 leading-relaxed">
              Recevoir les nouveautés produit, mises à jour de l&apos;app et événements. Indépendant des emails transactionnels (codes, réponses).
            </p>
          </div>
          <button
            onClick={toggleMarketing}
            disabled={saving}
            aria-label={marketingConsent ? 'Désactiver les emails marketing' : 'Activer les emails marketing'}
            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${marketingConsent ? 'bg-brand-white/60' : 'bg-brand-gray/20'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${marketingConsent ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {savedField === 'marketing' && <p className="font-ui text-xs text-green-400/60">Sauvegardé.</p>}
        {errorField?.field === 'marketing' && <p className="font-ui text-xs text-red-400">{errorField.msg}</p>}
      </div>

      {/* Premium */}
      <PremiumBlock member={member} />

      {/* Parrainage */}
      <ReferralBlock memberId={member.id} />

      {/* Modifier profil */}
      <Link href="/register?edit=1"
        className="w-full py-3 border border-brand-gray/20 text-center font-ui text-sm font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors rounded-[2px]">
        Modifier mon profil
      </Link>

      {/* Infos */}
      <div className="flex flex-col gap-2">
        <p className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">Compte</p>
        <p className="font-ui text-xs md:text-sm text-brand-gray/50">{member.email || 'Pas d\'email associé'}</p>
        <p className="font-ui text-xs text-brand-gray/25">
          Membre depuis le {new Date(member.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Changer mot de passe */}
      <Link href="/auth/forgot-password"
        className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/40 hover:border-brand-gray/30 hover:text-brand-gray/60 transition-colors rounded-[2px]"
      >
        Changer mon mot de passe
      </Link>

      {/* Feedback app */}
      <FeedbackBlock memberId={member.id} />

      {/* Liens légaux */}
      <div className="flex flex-col gap-2 border-t border-brand-gray/10 pt-4">
        <Link href="/cgv" className="font-ui text-xs text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
          Conditions Générales de Vente
        </Link>
        <Link href="/manifeste" className="font-ui text-xs text-brand-gray/30 hover:text-brand-gray/60 transition-colors">
          Manifeste
        </Link>
      </div>

      {/* Déconnexion */}
      <LogoutButton />

      {/* Export RGPD + Suppression de compte */}
      <div className="flex flex-col items-center gap-1 mt-2">
        <ExportDataLink />
        <DeleteAccountButton />
      </div>
    </div>
  );
}
