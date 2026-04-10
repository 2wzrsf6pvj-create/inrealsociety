'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

/** Accepte uniquement les chemins internes pour éviter les open redirects */
function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = safeRedirect(searchParams.get('redirect'));

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      // Message générique — ne pas distinguer email/mot de passe pour ne pas aider les attaquants
      setError('Email ou mot de passe incorrect.');
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-9">

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <div className="relative flex items-center justify-center mb-2">
            <div className="absolute w-16 h-16 rounded-full border border-brand-white/10 animate-ring-pulse" />
            <div className="w-12 h-12 rounded-full border border-brand-white/60 flex items-center justify-center">
              <span className="font-display text-xl font-light">✦</span>
            </div>
          </div>
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">Connexion</h2>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/50">
            Accédez à votre espace membre.
          </p>
        </div>

        <form onSubmit={handleLogin} noValidate className="w-full flex flex-col gap-5 animate-stagger-2">

          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">
              Email
            </label>
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
            <div className="flex items-center justify-between">
              <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">
                Mot de passe
              </label>
              <Link
                href="/auth/forgot-password"
                className="font-ui text-[0.52rem] text-brand-gray/25 tracking-[0.1em] hover:text-brand-gray/60 transition-colors"
              >
                Oublié ?
              </Link>
            </div>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-3 animate-stagger-3">
          <Link
            href="/auth/signup"
            className="font-ui text-[0.58rem] text-brand-gray/50 tracking-[0.1em] hover:text-brand-white transition-colors"
          >
            Pas encore membre ? Créer un compte →
          </Link>
          <Link
            href="/manifeste"
            className="font-ui text-[0.52rem] text-brand-gray/25 tracking-[0.1em] hover:text-brand-gray/50 transition-colors"
          >
            Découvrir In Real Society
          </Link>
        </div>

      </div>
    </main>
  );
}