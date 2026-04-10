'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const AI_PITCHES = [
  "Je traverse les villes les yeux ouverts. Si vous êtes là, c'est que votre instinct vous a bien guidé.",
  "Je crois aux conversations qui commencent par hasard et ne finissent jamais vraiment.",
  "Curieux du monde, attentif aux gens. La vie est trop courte pour attendre que les occasions arrivent seules.",
  "Je porte ce vêtement pour une raison simple : j'aime les rencontres qui ne ressemblent à aucune autre.",
];

interface FormData {
  name: string; who: string; intent: string; closing: string; instagram: string; photo: File | null;
}

function composePitch(f: FormData): string {
  return [f.who, f.intent, f.closing].filter(Boolean).join(' ');
}

function friendlyAuthError(code?: string): string {
  switch (code) {
    case 'user_already_exists':
    case 'email_exists':    return 'Un compte existe déjà avec cet email. Connectez-vous.';
    case 'weak_password':   return 'Mot de passe trop faible (8 caractères min).';
    case 'over_email_send_rate_limit': return 'Trop de tentatives. Réessayez dans quelques minutes.';
    default:                return 'Une erreur est survenue. Réessayez.';
  }
}

// ─── Étape 1 : Activation + Compte ────────────────────────────────────────────

function StepAccount({ onNext, initialCode }: { onNext: (email: string) => void; initialCode: string }) {
  const [code,     setCode]     = useState(initialCode);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [codeOk,   setCodeOk]   = useState(false);
  const [codeErr,  setCodeErr]  = useState('');
  const [checking, setChecking] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const validateCode = async (val: string) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeOk)        { setError("Code d'activation invalide."); return; }
    if (!email.trim())  { setError('Email requis.'); return; }
    if (password.length < 8) { setError('Mot de passe trop court (8 caractères min).'); return; }
    setLoading(true); setError('');
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/register` },
    });
    setLoading(false);
    if (authError) { setError(friendlyAuthError(authError.code)); return; }
    if (!data.session) { setError('Vérifiez votre email pour confirmer votre compte, puis revenez ici.'); return; }
    onNext(email.trim());
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-stagger-2">
      <div className="text-center flex flex-col gap-2">
        <h2 className="font-display text-[1.8rem] font-light tracking-[0.04em]">Votre compte.</h2>
        <p className="font-ui text-[0.55rem] font-light text-brand-gray/40 leading-relaxed">
          Le code d'activation vous a été envoyé par email après votre commande.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">Code d'activation</label>
          <div className="flex items-end gap-2">
            <input type="text" placeholder="XXXXXXXX" value={code} maxLength={12}
              onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''); setCode(v); setCodeOk(false); setCodeErr(''); if (v.length >= 6) validateCode(v); }}
              className={`flex-1 bg-transparent border-b font-mono text-[0.9rem] text-brand-white py-3 outline-none tracking-[0.3em] transition-colors ${codeErr ? 'border-red-900' : codeOk ? 'border-brand-white/60' : 'border-brand-gray/20 focus:border-brand-white/50'}`}
              style={{ minHeight: '44px' }} />
            <span className="font-ui text-[0.45rem] text-brand-gray/30 pb-3">{checking ? '...' : codeOk ? '✓ Valide' : ''}</span>
          </div>
          {codeErr && <p className="font-ui text-[0.5rem] text-red-400">{codeErr}</p>}
          <p className="font-ui text-[0.42rem] text-brand-gray/20 mt-1">
            Pas encore de t-shirt ? <a href="/shop" className="underline underline-offset-4 hover:text-brand-gray/50 transition-colors">Commander →</a>
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">Email</label>
          <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/60 font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">
            Mot de passe <span className="text-brand-gray/15 normal-case tracking-normal">(8 caractères min)</span>
          </label>
          <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/60 font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
        </div>
        {error && <p className="font-ui text-[0.58rem] text-red-400 text-center">{error}</p>}
        <button type="submit" disabled={loading || !codeOk}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ minHeight: '44px' }}>
          {loading ? 'Création du compte...' : 'Créer mon compte →'}
        </button>
        <a href="/auth/login" className="font-ui text-[0.48rem] text-brand-gray/25 tracking-[0.15em] uppercase text-center hover:text-brand-gray/50 transition-colors">
          Déjà un compte ? Se connecter
        </a>
      </form>
    </div>
  );
}

// ─── Étape 2 : Profil ─────────────────────────────────────────────────────────

function StepProfile({ form, onChange, onNext, onBack, isEditing }: {
  form: FormData; onChange: (f: FormData) => void; onNext: () => void; onBack: () => void; isEditing: boolean;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [error,     setError]     = useState('');

  const field = (key: keyof FormData, value: string) => onChange({ ...form, [key]: value });

  const handleAi = async () => {
    setAiLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    onChange({ ...form, who: AI_PITCHES[Math.floor(Math.random() * AI_PITCHES.length)], intent: '', closing: '' });
    setAiLoading(false);
  };

  const handleNext = () => {
    if (!form.name.trim()) { setError('Votre prénom est requis.'); return; }
    if (!composePitch(form).trim()) { setError('Rédigez votre pitch ou générez-en un.'); return; }
    setError(''); onNext();
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="text-center flex flex-col gap-2 animate-stagger-1">
        <h2 className="font-display text-[1.8rem] font-light tracking-[0.04em]">Votre présence.</h2>
        <p className="font-ui text-[0.55rem] font-light text-brand-gray/40">Ce que vous êtes, en quelques mots.</p>
      </div>
      <div className="flex flex-col gap-5 animate-stagger-2">
        <div className="flex flex-col gap-1">
          <label className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">Prénom ou pseudo</label>
          <input type="text" maxLength={30} value={form.name} onChange={e => field('name', e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/15 focus:border-brand-white/60 font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
        </div>
        <div className="flex flex-col gap-3">
          <p className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">Votre pitch</p>
          <button type="button" onClick={handleAi} disabled={aiLoading}
            className="w-full py-3 border border-brand-white/20 rounded-[1px] flex items-center justify-center gap-2 hover:border-brand-white/40 transition-colors disabled:opacity-40"
            style={{ minHeight: '44px' }}>
            <span style={{ fontSize: '14px' }}>{aiLoading ? '...' : '✦'}</span>
            <span className="font-ui text-[0.55rem] text-brand-white/60 tracking-[0.15em] uppercase">
              {aiLoading ? 'Génération...' : "Générer avec l'IA"}
            </span>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-brand-gray/10" />
            <span className="font-ui text-[0.42rem] text-brand-gray/20 uppercase">ou rédigez</span>
            <div className="flex-1 h-px bg-brand-gray/10" />
          </div>
          {[
            { key: 'who',     label: 'Qui êtes-vous ?',                ph: 'En une phrase, juste.' },
            { key: 'intent',  label: 'Que cherchez-vous à provoquer ?', ph: 'Une conversation, une rencontre...' },
            { key: 'closing', label: 'Votre phrase de fin',             ph: 'Celle qui reste.' },
          ].map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="font-ui text-[0.42rem] text-brand-gray/20 tracking-[0.15em] uppercase">{f.label}</label>
              <input type="text" maxLength={200} placeholder={f.ph} value={form[f.key as keyof FormData] as string}
                onChange={e => field(f.key as keyof FormData, e.target.value)}
                className="w-full bg-transparent border-b border-brand-gray/10 focus:border-brand-white/50 font-ui font-light text-[0.78rem] text-brand-white py-2.5 outline-none transition-colors placeholder:text-brand-gray/15"
                style={{ minHeight: '44px' }} />
            </div>
          ))}
          {composePitch(form) && (
            <div className="p-3 border border-brand-gray/10 rounded-[1px]">
              <p className="font-ui text-[0.42rem] text-brand-gray/25 tracking-[0.15em] uppercase mb-1">Aperçu</p>
              <p className="font-display text-[0.78rem] font-light italic text-brand-gray/50 leading-relaxed">&ldquo;{composePitch(form)}&rdquo;</p>
            </div>
          )}
        </div>
        {error && <p className="font-ui text-[0.58rem] text-red-400 text-center">{error}</p>}
        <button onClick={handleNext}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200"
          style={{ minHeight: '44px' }}>
          Continuer →
        </button>
        {!isEditing && (
          <button onClick={onBack} className="font-ui text-[0.48rem] text-brand-gray/25 tracking-[0.15em] uppercase underline underline-offset-4 py-2">
            ← retour
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Étape 3 : Détails optionnels ─────────────────────────────────────────────

function StepOptional({ form, onChange, onSubmit, onBack, loading, error, isEditing }: {
  form: FormData; onChange: (f: FormData) => void; onSubmit: () => void;
  onBack: () => void; loading: boolean; error: string; isEditing: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange({ ...form, photo: file });
    setPreview(URL.createObjectURL(file));
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="text-center flex flex-col gap-2 animate-stagger-1">
        <h2 className="font-display text-[1.8rem] font-light tracking-[0.04em]">Pour aller plus loin.</h2>
        <p className="font-ui text-[0.55rem] font-light text-brand-gray/40">Tout est optionnel.</p>
      </div>
      <div className="flex flex-col gap-5 animate-stagger-2">
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="relative w-20 h-20 rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden hover:border-brand-gray/40 transition-colors">
            {preview ? <img src={preview} alt="preview" className="w-full h-full object-cover" /> : <span className="font-ui text-[0.5rem] text-brand-gray/20 tracking-[0.1em] uppercase">Photo</span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">
            Instagram <span className="text-brand-gray/15 normal-case tracking-normal">(optionnel)</span>
          </label>
          <input type="text" placeholder="@votre_pseudo" value={form.instagram}
            onChange={e => onChange({ ...form, instagram: e.target.value })}
            className="w-full bg-transparent border-b border-brand-gray/15 focus:border-brand-white/50 font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors placeholder:text-brand-gray/15"
            style={{ minHeight: '44px' }} />
        </div>
        {error && <p className="font-ui text-[0.58rem] text-red-400 text-center">{error}</p>}
        <button onClick={onSubmit} disabled={loading}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
          style={{ minHeight: '44px' }}>
          {loading ? 'Activation...' : isEditing ? 'Sauvegarder' : 'Activer mon vêtement'}
        </button>
        <button onClick={onBack} className="font-ui text-[0.48rem] text-brand-gray/25 tracking-[0.15em] uppercase underline underline-offset-4 py-2">
          ← retour
        </button>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

function RegisterContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [step,           setStep]           = useState<1 | 2 | 3>(1);
  const [activationCode, setActivationCode] = useState('');
  const [isEditing,      setIsEditing]      = useState(false);
  const [existingId,     setExistingId]     = useState<string | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [form, setForm] = useState<FormData>({ name: '', who: '', intent: '', closing: '', instagram: '', photo: null });

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) setActivationCode(code.toUpperCase());
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: member } = await supabase
        .from('members').select('*').eq('auth_user_id', user.id).single();
      if (!member) return;
      setIsEditing(true);
      setExistingId(member.id);
      setForm(f => ({ ...f, name: member.name, who: member.pitch, instagram: member.instagram || '' }));
      setStep(2);
    });
  }, [searchParams]);

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
          body: JSON.stringify({ name: form.name.trim(), pitch: pitch.trim(), instagram: form.instagram.trim() || undefined }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur de mise à jour.'); }
        if (form.photo) {
          await uploadPhoto(form.photo);
        }
      } else {
        const res  = await fetch('/api/member/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name.trim(), pitch: pitch.trim(), instagram: form.instagram.trim() || undefined, activationCode }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur de création.');
        if (form.photo && data.memberId) {
          await uploadPhoto(form.photo);
        }
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally { setLoading(false); }
  };

  return (
    <div className="z-10 flex flex-col items-center w-full max-w-sm gap-8">
      {!isEditing && (
        <div className="flex items-center gap-2">
          {[1,2,3].map((s,i) => (
            <React.Fragment key={s}>
              {i > 0 && <div className="w-8 h-px bg-brand-gray/20" />}
              <div className={`w-6 h-6 rounded-full border flex items-center justify-center font-ui text-[0.45rem] transition-all ${step===s ? 'border-brand-white bg-brand-white text-brand-black' : step>s ? 'border-brand-white/30 text-brand-white/30' : 'border-brand-gray/20 text-brand-gray/20'}`}>{s}</div>
            </React.Fragment>
          ))}
        </div>
      )}
      {step === 1 && <StepAccount onNext={(em) => { setStep(2); }} initialCode={activationCode} />}
      {step === 2 && <StepProfile form={form} onChange={setForm} onNext={() => setStep(3)} onBack={() => setStep(1)} isEditing={isEditing} />}
      {step === 3 && <StepOptional form={form} onChange={setForm} onSubmit={handleSubmit} onBack={() => setStep(2)} loading={loading} error={error} isEditing={isEditing} />}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <React.Suspense fallback={null}><RegisterContent /></React.Suspense>
      <button onClick={() => router.push('/')}
        className="font-ui text-[0.48rem] text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors py-3 mt-4"
        style={{ minHeight: '44px' }}>
        ← retour
      </button>
    </main>
  );
}