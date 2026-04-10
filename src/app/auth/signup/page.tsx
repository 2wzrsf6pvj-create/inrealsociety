'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

/** Messages d'erreur Supabase traduits — évite d'exposer les messages internes */
function friendlyAuthError(code?: string): string {
  switch (code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cet email.';
    case 'weak_password':
      return 'Mot de passe trop faible.';
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    default:
      return 'Une erreur est survenue. Réessayez.';
  }
}

export default function SignupPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      // On traduit l'erreur — on n'expose pas authError.message brut
      setError(friendlyAuthError(authError.code));
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6">
        <div className="z-10 flex flex-col items-center w-full max-w-xs gap-6 text-center animate-stagger-1">
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/30 to-transparent" />
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Vérifiez votre email.
          </h2>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/50 leading-relaxed">
            Un lien de confirmation a été envoyé à<br />
            <span className="text-brand-white/80">{email}</span>
          </p>
          <p className="font-ui text-[0.58rem] text-brand-gray/30 leading-relaxed">
            Cliquez sur le lien pour activer votre compte,<br />
            puis configurez votre profil.
          </p>
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/30 to-transparent" />
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-8">

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">Créer un compte</h2>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/50">
            Première étape pour rejoindre le club.
          </p>
        </div>

        <form onSubmit={handleSignup} noValidate className="w-full flex flex-col gap-5 animate-stagger-2">

          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors placeholder:text-brand-gray/20"
              style={{ minHeight: '44px' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">
              Mot de passe <span className="text-brand-gray/20 normal-case tracking-normal">(8 caractères min)</span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
              style={{ minHeight: '44px' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">Confirmer</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
              style={{ minHeight: '44px' }}
            />
          </div>

          {error && (
            <p className="font-ui text-[0.58rem] text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="animate-shimmer w-full py-4 mt-2 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <Link
          href="/auth/login"
          className="font-ui text-[0.58rem] text-brand-gray/40 tracking-[0.1em] hover:text-brand-white transition-colors animate-stagger-3"
        >
          Déjà membre ? Se connecter →
        </Link>

      </div>
    </main>
  );
}