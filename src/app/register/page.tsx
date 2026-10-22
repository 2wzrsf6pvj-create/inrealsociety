'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { captureEvent, identifyMember } from '@/lib/posthog-client';
import { recallCheckoutEmail, forgetCheckoutEmail } from '@/lib/checkout-email';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 Mo

interface FormData {
  name: string; who: string; intent: string; closing: string; instagram: string; photo: File | null;
  acceptedTerms: boolean;   // §8/9 — consentement d'activation (CGV + service)
  isAdult:       boolean;   // déclaration « 18 ans ou plus » (service réservé aux majeurs)
}

function composePitch(f: FormData): string {
  return [f.who, f.intent, f.closing].filter(Boolean).join(' ');
}

function friendlyAuthError(code?: string): string {
  switch (code) {
    // Réponse neutre anti-énumération : on ne confirme pas qu'un compte existe.
    // L'utilisateur légitime peut récupérer son accès via "Mot de passe oublié".
    case 'user_already_exists':
    case 'email_exists':                return 'Si vous avez déjà un compte, connectez-vous ou réinitialisez votre mot de passe.';
    case 'weak_password':               return 'Mot de passe trop faible (8 caractères min).';
    case 'over_email_send_rate_limit':  return 'Trop de tentatives. Réessayez dans quelques minutes.';
    default:                            return 'Une erreur est survenue. Réessayez.';
  }
}

// ─── Hook de validation du code d'activation ─────────────────────────────────

function useCodeValidation(initialCode: string) {
  const [code,     setCode]     = useState(initialCode);
  const [codeOk,   setCodeOk]   = useState(false);
  const [codeErr,  setCodeErr]  = useState('');
  const [checking, setChecking] = useState(false);
  // Anti-rafale : la frappe déclenchait un appel /api/activate à CHAQUE caractère
  // dès 6 (3 appels pour un code de 8, consommant le rate-limit). On debounce.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      if (initialCode.length >= 6) validate(initialCode);  // depuis l'URL : direct
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const validate = async (val: string) => {
    if (val.length < 6) { setCodeOk(false); return; }
    setChecking(true); setCodeErr('');
    try {
      const res  = await fetch('/api/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: val }) });
      const data = await res.json();
      if (data.valid) setCodeOk(true);
      else { setCodeErr(data.error || 'Code invalide.'); setCodeOk(false); }
    } catch { setCodeErr('Erreur de validation.'); setCodeOk(false); }
    setChecking(false);
  };

  const handleChange = (val: string) => {
    const v = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCode(v);
    setCodeOk(false);
    setCodeErr('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.length >= 6) debounceRef.current = setTimeout(() => validate(v), 400);
  };

  return { code, codeOk, codeErr, checking, handleChange };
}

// ─── Champ code d'activation (réutilisable) ──────────────────────────────────

function CodeField({ code, codeOk, codeErr, checking, onChange }: {
  code: string; codeOk: boolean; codeErr: string; checking: boolean;
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="activation-code" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Code d&apos;activation</label>
      <div className="flex items-end gap-2">
        <input id="activation-code" type="text" placeholder="XXXXXXXX" value={code} maxLength={12}
          onChange={e => onChange(e.target.value)}
          className={`flex-1 bg-transparent border-b font-mono text-lg text-brand-white py-3 outline-none tracking-[0.3em] transition-colors ${codeErr ? 'border-red-500' : codeOk ? 'border-brand-white/60' : 'border-brand-gray/20 focus:border-brand-white/50'}`}
          style={{ minHeight: '44px' }} />
        <span className="font-ui text-xs text-brand-gray/55 pb-3">{checking ? '...' : codeOk ? 'Valide' : ''}</span>
      </div>
      {codeErr && <p className="font-ui text-sm text-red-400" role="alert">{codeErr}</p>}
    </div>
  );
}

// ─── Étape 1 : Activation + Compte (visiteur non connecté) ───────────────────

function ResendCodeBlock() {
  const [open,    setOpen]    = useState(false);
  const [email,   setEmail]   = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);

  const handleResend = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      await fetch('/api/order/resend-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim() }),
      });
    } catch { /* ignore */ }
    setSending(false);
    setDone(true);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="font-ui text-xxs md:text-xs text-brand-gray/50 underline underline-offset-4 hover:text-brand-white/80 transition-colors -mt-2 self-start">
        Code perdu ? Renvoyer l&apos;email.
      </button>
    );
  }

  if (done) {
    return (
      <p className="font-ui text-xxs md:text-xs text-brand-gray/50 -mt-2">
        Si une commande correspond à cet email, vous recevrez le code dans quelques minutes.
      </p>
    );
  }

  return (
    <div className="flex items-end gap-2 -mt-2">
      <input type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)}
        className="flex-1 bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 font-ui font-light text-sm text-brand-white py-2 outline-none transition-colors"
        style={{ minHeight: '36px' }} />
      <button type="button" onClick={handleResend} disabled={sending || !email.trim()}
        className="font-ui text-xxs tracking-[0.15em] uppercase text-brand-gray/50 hover:text-brand-white/80 transition-colors disabled:opacity-40 py-2">
        {sending ? '...' : 'Envoyer'}
      </button>
    </div>
  );
}

function StepAccount({ onNext, codeState }: {
  onNext: () => void;
  codeState: ReturnType<typeof useCodeValidation>;
}) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  // Notice POSITIVE (≠ erreur) : « confirmez votre email ». Affiché en doré, pas
  // en rouge — c'est une étape de succès, pas un échec (évite la confusion).
  const [notice,   setNotice]   = useState('');
  // Email de la commande, saisi en boutique dans ce même onglet : pré-rempli et
  // modifiable. Lu après le montage (pas de sessionStorage au rendu serveur).
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const saved = recallCheckoutEmail();
    if (!saved) return;
    setEmail(saved);
    setPrefilled(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeState.codeOk) { setError("Code d'activation invalide."); return; }
    if (!email.trim())     { setError('Email requis.'); return; }
    if (password.length < 8) { setError('Mot de passe trop court (8 caractères min).'); return; }
    setLoading(true); setError(''); setNotice('');
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(), password,
      // Propage le code dans le redirect : sinon, après confirmation email,
      // l'utilisateur revient sur /register sans code et doit le re-saisir.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/register?code=' + codeState.code)}` },
    });
    setLoading(false);
    if (authError) { setError(friendlyAuthError(authError.code)); return; }
    forgetCheckoutEmail();
    captureEvent('account_created', { needs_confirmation: !data.session });
    if (!data.session) {
      setNotice('Compte créé. Confirmez votre email (vérifiez vos spams), puis revenez ici pour finaliser votre profil.');
      return;
    }
    onNext();
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-stagger-2">
      <div className="text-center flex flex-col gap-2">
        <h2 className="font-display text-3xl font-light tracking-[0.04em]">Votre compte.</h2>
        <p className="font-ui text-sm font-light text-brand-gray/50 leading-relaxed">
          Le code d&apos;activation vous a été envoyé par email après votre commande.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <CodeField {...codeState} onChange={codeState.handleChange} />
        <ResendCodeBlock />
        <p className="font-ui text-xxs md:text-xs text-brand-gray/50 -mt-3">
          Pas encore de t-shirt ? <a href="/shop" className="underline underline-offset-4 hover:text-brand-white/80 transition-colors">Commander</a>
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="register-email" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Email</label>
          <input id="register-email" type="email" autoComplete="email" value={email}
            onChange={e => { setEmail(e.target.value); setPrefilled(false); }}
            aria-describedby={prefilled ? 'register-email-hint' : undefined}
            className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/60 font-ui font-light text-base text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
          {prefilled && (
            <p id="register-email-hint" className="font-ui text-xxs md:text-xs text-brand-gray/50">
              L&apos;email de votre commande. Vous pouvez le modifier.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="register-password" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">
            Mot de passe <span className="text-brand-gray/50 normal-case tracking-normal">(8 caractères min)</span>
          </label>
          <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/60 font-ui font-light text-base text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
        </div>
        {error && <p className="font-ui text-sm text-red-400 text-center" role="alert">{error}</p>}
        {notice && (
          <div className="w-full bg-[#0a0a08] border border-[#C5A059]/30 rounded-[2px] px-4 py-3 flex flex-col items-center gap-1 text-center animate-fade-in">
            <p className="font-ui text-xxs text-[#C5A059]/85 tracking-[0.18em] uppercase">✦ Vérifiez votre email</p>
            <p className="font-ui text-sm text-brand-gray/70 leading-relaxed">{notice}</p>
          </div>
        )}
        <button type="submit" disabled={loading || !codeState.codeOk}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ minHeight: '44px' }}>
          {loading ? 'Création du compte...' : 'Créer mon compte'}
        </button>
        <a href="/auth/login" className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase text-center hover:text-brand-white/80 transition-colors">
          Déjà un compte ? Se connecter
        </a>
      </form>
    </div>
  );
}

// ─── Étape 2 : Profil complet (avant : Profile + Optional en 2 étapes) ─────
// Tout-en-un pour réduire la friction d'inscription. Champs requis (name, pitch)
// en premier, puis section "Détails optionnels" pour la photo et Instagram.

function StepProfile({ form, onChange, onSubmit, onBack, loading, error, isEditing, isLoggedIn, codeState }: {
  form: FormData; onChange: (f: FormData) => void; onSubmit: () => void; onBack: () => void;
  loading: boolean; error: string;
  isEditing: boolean; isLoggedIn: boolean;
  codeState: ReturnType<typeof useCodeValidation>;
}) {
  const [localError, setLocalError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [fileErr, setFileErr]   = useState('');

  const field = (key: keyof FormData, value: string) => onChange({ ...form, [key]: value });

  const needsCode = !isEditing && isLoggedIn;

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileErr('');
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFileErr('Format non supporté. Utilisez JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setFileErr('Photo trop volumineuse (5 Mo max).');
      return;
    }
    onChange({ ...form, photo: file });
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);  // libère l'objectURL précédent (anti-fuite)
      return URL.createObjectURL(file);
    });
  };

  const handleSubmit = () => {
    if (needsCode && !codeState.codeOk) { setLocalError("Code d'activation requis."); return; }
    if (!form.name.trim()) { setLocalError('Votre prénom est requis.'); return; }
    if (!composePitch(form).trim()) { setLocalError('Rédigez votre pitch : remplissez au moins une des trois phrases.'); return; }
    // §8/9 — consentement requis à l'activation (pas en édition de profil).
    if (!isEditing && !form.isAdult) { setLocalError('In Real Society est réservé aux personnes de 18 ans ou plus.'); return; }
    if (!isEditing && !form.acceptedTerms) { setLocalError('Vous devez accepter les CGV pour activer votre vêtement.'); return; }
    setLocalError('');
    onSubmit();
  };

  const displayedError = localError || error;

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="text-center flex flex-col gap-2 animate-stagger-1">
        <h2 className="font-display text-3xl font-light tracking-[0.04em]">
          {isEditing ? 'Modifier votre profil.' : 'Votre présence.'}
        </h2>
        <p className="font-ui text-sm font-light text-brand-gray/50">
          {isEditing ? 'Mettez à jour vos informations.' : 'Ce que vous êtes, en quelques mots.'}
        </p>
      </div>
      <div className="flex flex-col gap-5 animate-stagger-2">
        {needsCode && (
          <CodeField {...codeState} onChange={codeState.handleChange} />
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="register-name" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Prénom ou pseudo</label>
          <input id="register-name" type="text" maxLength={30} value={form.name} onChange={e => field('name', e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/15 focus:border-brand-white/60 font-ui font-light text-base text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Votre pitch</p>
          {[
            { key: 'who',     label: 'Qui êtes-vous ?',                ph: 'En une phrase, juste.' },
            { key: 'intent',  label: 'Que cherchez-vous à provoquer ?', ph: 'Une conversation, une rencontre...' },
            { key: 'closing', label: 'Votre phrase de fin',             ph: 'Celle qui reste.' },
          ].map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label htmlFor={`pitch-${f.key}`} className="font-ui text-xxs md:text-xs text-brand-gray/50 tracking-[0.15em] uppercase">{f.label}</label>
              <input id={`pitch-${f.key}`} type="text" maxLength={200} placeholder={f.ph} value={form[f.key as keyof FormData] as string}
                onChange={e => field(f.key as keyof FormData, e.target.value)}
                className="w-full bg-transparent border-b border-brand-gray/10 focus:border-brand-white/50 font-ui font-light text-base text-brand-white py-2.5 outline-none transition-colors placeholder:text-brand-gray/50"
                style={{ minHeight: '44px' }} />
            </div>
          ))}
          {composePitch(form) && (
            <div className="p-3 border border-brand-gray/10 rounded-[1px]">
              <p className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase mb-1">Aperçu</p>
              <p className="font-display text-base font-light italic text-brand-gray/50 leading-relaxed">&ldquo;{composePitch(form)}&rdquo;</p>
            </div>
          )}
        </div>

        {/* Section Détails optionnels — était une étape séparée, maintenant inline */}
        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase">Détails optionnels</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>

        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()}
            aria-label="Ajouter une photo de profil"
            className="relative w-16 h-16 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden hover:border-brand-gray/40 transition-colors flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview
              ? <img src={preview} alt="Aperçu de votre photo" className="w-full h-full object-cover" />
              : <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.1em] uppercase">+ Photo</span>}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-xs text-brand-gray/50">Photo de profil</p>
            <p className="font-ui text-xxs text-brand-gray/50">JPEG, PNG ou WebP · 5 Mo max</p>
            {fileErr && <p className="font-ui text-xs text-red-400" role="alert">{fileErr}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="register-instagram" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">
            Instagram <span className="text-brand-gray/50 normal-case tracking-normal">(optionnel)</span>
          </label>
          <input id="register-instagram" type="text" placeholder="votre_pseudo" value={form.instagram}
            onChange={e => onChange({ ...form, instagram: e.target.value })}
            className="w-full bg-transparent border-b border-brand-gray/15 focus:border-brand-white/50 font-ui font-light text-base text-brand-white py-3 outline-none transition-colors placeholder:text-brand-gray/50"
            style={{ minHeight: '44px' }} />
        </div>

        {/* NB : l'accroche + la forme du QR sont VERROUILLÉES au checkout — le tee
            est imprimé au paiement. Plus de sélecteur ici (choix déjà figé). */}

        {/* Âge minimum : déclaration distincte des CGV (pas en édition). */}
        {!isEditing && (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={form.isAdult}
              onChange={e => onChange({ ...form, isAdult: e.target.checked })}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-white cursor-pointer"
              style={{ minWidth: '16px' }} />
            <span className="font-ui text-xxs text-brand-gray/65 leading-relaxed">
              J&apos;ai 18 ans ou plus.
            </span>
          </label>
        )}

        {/* §8/9 — consentement bien/service à l'activation (pas en édition). */}
        {!isEditing && (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={form.acceptedTerms}
              onChange={e => onChange({ ...form, acceptedTerms: e.target.checked })}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-white cursor-pointer"
              style={{ minWidth: '16px' }} />
            <span className="font-ui text-xxs text-brand-gray/65 leading-relaxed">
              J&apos;accepte les <Link href="/cgv" target="_blank" className="underline underline-offset-2 hover:text-brand-white">CGV/CGU</Link> et
              je demande l&apos;activation immédiate du service de messagerie. Je reconnais
              qu&apos;en commençant l&apos;exécution du service maintenant, je renonce à mon
              droit de rétractation <span className="text-brand-gray/80">sur ce service</span>
              (les conditions de retour du t-shirt sont précisées dans les CGV).
            </span>
          </label>
        )}

        {displayedError && <p className="font-ui text-sm text-red-400 text-center" role="alert">{displayedError}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
          style={{ minHeight: '44px' }}>
          {loading ? 'Activation...' : isEditing ? 'Sauvegarder' : 'Activer mon vêtement'}
        </button>
        {!isLoggedIn && (
          <button onClick={onBack} className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase underline underline-offset-4 py-2">
            ← retour
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

function RegisterContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [step,           setStep]           = useState<1 | 2>(1);
  const [isEditing,      setIsEditing]      = useState(false);
  const [isLoggedIn,     setIsLoggedIn]     = useState(false);
  const [existingId,     setExistingId]     = useState<string | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [form, setForm] = useState<FormData>({ name: '', who: '', intent: '', closing: '', instagram: '', photo: null, acceptedTerms: false, isAdult: false });

  const initialCode = searchParams.get('code')?.toUpperCase() || '';
  const codeState   = useCodeValidation(initialCode);

  // Funnel post-achat : ouverture de /register (avec ou sans code prérempli).
  useEffect(() => { captureEvent('register_viewed', { has_code: !!initialCode }); }, [initialCode]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setIsLoggedIn(true);

      // Colonnes non-revoke uniquement : select('*') échouerait pour le rôle
      // authenticated (030 revoke email/stripe_*/plan_expires_at).
      const { data: member } = await supabase
        .from('members').select('id, name, pitch, instagram').eq('auth_user_id', user.id).maybeSingle();

      if (member) {
        setIsEditing(true);
        setExistingId(member.id);
        setForm(f => ({ ...f, name: member.name, who: member.pitch, instagram: member.instagram || '' }));
      }

      setStep(2);
    });
  }, []);

  const uploadPhoto = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/member/avatar', { method: 'POST', body: formData });
    if (!res.ok) return null;
    const data = await res.json();
    return data.photoUrl ?? null;
  };

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const pitch = composePitch(form);
      if (isEditing && existingId) {
        const res = await fetch('/api/member/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          // instagram envoyé TOUJOURS (même ''), sinon vider le champ ne l'efface
          // jamais (undefined = omis = colonne intacte).
          body: JSON.stringify({ name: form.name.trim(), pitch: pitch.trim(), instagram: form.instagram.trim() }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur de mise à jour.'); }
      } else {
        const res  = await fetch('/api/member/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name.trim(), pitch: pitch.trim(), instagram: form.instagram.trim() || undefined, activationCode: codeState.code, acceptedTerms: form.acceptedTerms, isAdult: form.isAdult }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur de création.');
        // Fin du funnel post-achat : profil créé → fulfillment déclenché. On lie
        // le distinct_id anonyme (qui a parcouru shop→success→register) au membre.
        if (data.memberId) {
          identifyMember(data.memberId, {});
          captureEvent('member_created', { member_id: data.memberId });
          localStorage.removeItem('pending_activation_code');
          // Le code d'activation est désormais CONSOMMÉ. On bascule en mode édition
          // pour qu'un ré-envoi (typiquement après échec d'upload photo ci-dessous)
          // passe par le PATCH idempotent et NE re-poste PAS le code (sinon piège :
          // profil créé mais dashboard inatteignable, code invalide).
          setIsEditing(true);
          setExistingId(data.memberId);
        }
      }
      if (form.photo) {
        const photoUrl = await uploadPhoto(form.photo);
        if (!photoUrl) {
          // Le profil est créé/à jour ; seule la photo a échoué. On le dit au
          // lieu de rediriger en laissant croire que tout a réussi.
          setError("Votre profil est enregistré, mais la photo n'a pas pu être ajoutée. Réessayez, ou ajoutez-la plus tard depuis votre profil.");
          setLoading(false);
          return;
        }
      }
      if (isEditing) sessionStorage.setItem('profile_updated', '1');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally { setLoading(false); }
  };

  const totalSteps = isLoggedIn ? 1 : 2;
  const currentStep = isLoggedIn ? step - 1 : step;

  return (
    <div className="z-10 flex flex-col items-center w-full max-w-sm gap-8">
      {/* Indicateur de progression */}
      <div className="w-full flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${i + 1 <= currentStep ? 'bg-brand-white/60' : 'bg-brand-gray/15'}`} />
              {i < totalSteps - 1 && (
                <div className={`w-8 h-px transition-colors ${i + 1 < currentStep ? 'bg-brand-white/30' : 'bg-brand-gray/10'}`} />
              )}
            </div>
          ))}
        </div>
        <p className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">
          Étape {currentStep}/{totalSteps}
        </p>
      </div>

      {/* key={step} force le re-mount → la nouvelle step entre avec animate-stagger-* */}
      <div key={step} className="w-full">
        {step === 1 && <StepAccount onNext={() => setStep(2)} codeState={codeState} />}
        {step === 2 && (
          <StepProfile
            form={form}
            onChange={setForm}
            onSubmit={handleSubmit}
            onBack={() => setStep(1)}
            loading={loading}
            error={error}
            isEditing={isEditing}
            isLoggedIn={isLoggedIn}
            codeState={codeState}
          />
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <React.Suspense fallback={null}><RegisterContent /></React.Suspense>
    </main>
  );
}
