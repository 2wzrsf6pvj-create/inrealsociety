'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Entrez votre adresse email.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Adresse email invalide.');
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/auth/reset-password` }
    );

    setLoading(false);

    if (authError) {
      // Message générique — ne pas confirmer si l'email existe ou non
      setError('Une erreur est survenue. Réessayez dans quelques instants.');
      return;
    }

    // On affiche toujours le succès même si l'email n'existe pas (évite l'énumération)
    setSent(true);
  };

  if (sent) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">
        <div className="z-10 flex flex-col items-center w-full max-w-xs gap-8 text-center animate-stagger-1">
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Vérifiez votre email.
          </h2>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/50 leading-relaxed">
            Si un compte existe pour<br />
            <span className="text-brand-white/80">{email}</span><br />
            vous recevrez un lien de réinitialisation.
          </p>
          <p className="font-ui text-[0.55rem] text-brand-gray/30 leading-relaxed">
            Le lien expire dans 1 heure.
          </p>
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          <Link
            href="/auth/login"
            className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white transition-colors"
          >
            ← Retour à la connexion
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-9">

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Mot de passe oublié.
          </h2>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/50 leading-relaxed">
            Entrez votre email pour recevoir<br />un lien de réinitialisation.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full flex flex-col gap-5 animate-stagger-2">
          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors placeholder:text-brand-gray/20"
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
            {loading ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>

        <Link
          href="/auth/login"
          className="font-ui text-[0.55rem] text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white transition-colors animate-stagger-3"
        >
          ← Retour à la connexion
        </Link>

      </div>
    </main>
  );
}