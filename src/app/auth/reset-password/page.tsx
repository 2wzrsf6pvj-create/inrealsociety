'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [ready,     setReady]     = useState(false);

  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    // Timeout : si pas de PASSWORD_RECOVERY après 10s, le lien est invalide
    const timeout = setTimeout(() => {
      if (!ready) setExpired(true);
    }, 10_000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (authError) {
      setError('Erreur lors de la réinitialisation. Recommencez depuis le début.');
      return;
    }

    router.push('/auth/login?reset=success');
    router.refresh();
  };

  if (!ready) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6">
        <div className="z-10 flex flex-col items-center gap-4 text-center">
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          {expired ? (
            <>
              <p className="font-display text-2xl font-light">Ce lien a expiré.</p>
              <p className="font-ui text-sm text-brand-gray/40 leading-relaxed">
                Demandez un nouveau lien de réinitialisation.
              </p>
              <a href="/auth/forgot-password" className="font-ui text-sm text-brand-gray/30 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white transition-colors mt-4">
                Renvoyer un lien
              </a>
            </>
          ) : (
            <p className="font-ui text-sm font-light text-brand-gray/40 tracking-wide">
              Vérification du lien en cours...
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-9">

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <h2 className="font-display text-3xl font-light tracking-[0.06em]">
            Nouveau mot de passe.
          </h2>
          <p className="font-ui text-sm font-light text-brand-gray/50">
            Choisissez un mot de passe sécurisé.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full flex flex-col gap-5 animate-stagger-2">
          <div className="flex flex-col gap-1">
            <label className="font-ui text-xs text-brand-gray/40 tracking-[0.18em] uppercase">
              Nouveau mot de passe <span className="text-brand-gray/20 normal-case tracking-normal">(8 car. min)</span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-base text-brand-white py-3 outline-none transition-colors"
              style={{ minHeight: '44px' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-ui text-xs text-brand-gray/40 tracking-[0.18em] uppercase">
              Confirmer
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-base text-brand-white py-3 outline-none transition-colors"
              style={{ minHeight: '44px' }}
            />
          </div>

          {error && (
            <p className="font-ui text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="animate-shimmer w-full py-4 mt-2 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {loading ? 'Mise à jour...' : 'Réinitialiser'}
          </button>
        </form>

        <a href="/auth/login"
          className="font-ui text-xs text-brand-gray/25 tracking-[0.1em] underline underline-offset-4 hover:text-brand-gray/50 transition-colors animate-stagger-3 mt-2"
        >
          &larr; retour &agrave; la connexion
        </a>

      </div>
    </main>
  );
}
