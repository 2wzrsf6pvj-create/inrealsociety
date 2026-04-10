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

  useEffect(() => {
    const supabase = createClient();

    // onAuthStateChange retourne un objet avec une méthode unsubscribe
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    // Nettoyage du listener pour éviter la fuite mémoire
    return () => subscription.unsubscribe();
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

    // Redirige vers le login après succès — la session est réinitialisée
    router.push('/auth/login?reset=success');
    router.refresh();
  };

  if (!ready) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6">
        <div className="z-10 flex flex-col items-center gap-4 text-center">
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/40 tracking-wide">
            Vérification du lien en cours...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-9">

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Nouveau mot de passe.
          </h2>
          <p className="font-ui text-[0.62rem] font-light text-brand-gray/50">
            Choisissez un mot de passe sécurisé.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full flex flex-col gap-5 animate-stagger-2">
          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">
              Nouveau mot de passe <span className="text-brand-gray/20 normal-case tracking-normal">(8 car. min)</span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
              style={{ minHeight: '44px' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-ui text-[0.55rem] text-brand-gray/40 tracking-[0.18em] uppercase">
              Confirmer
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
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
            {loading ? 'Mise à jour...' : 'Réinitialiser'}
          </button>
        </form>

      </div>
    </main>
  );
}