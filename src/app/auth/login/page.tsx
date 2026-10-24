'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { safeInternalPath } from '@/lib/safe-redirect';
import { LOGIN_SUCCESS_KEY } from '@/lib/constants';
import { authFailureMessage, isOffline, offlineMessage } from '@/lib/request';
import { openFullPage } from '@/lib/full-page';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect     = safeInternalPath(searchParams.get('redirect'));

  // Messages portés par d'autres flux qui retombent sur /auth/login :
  //   * reset-password   → ?reset=success
  //   * callback échoué   → ?error=missing_code | auth_failed
  // Sans ça, l'utilisateur atterrissait sur un formulaire muet (lien expiré =
  // aucune explication, mot de passe changé = aucune confirmation).
  const resetOk     = searchParams.get('reset') === 'success';
  const urlError    = searchParams.get('error');
  // Un lien de confirmation ouvert dans un autre navigateur que celui de
  // l'inscription échoue ici alors que l'adresse est bien confirmée.
  const urlErrorMsg = urlError === 'auth_failed'
    ? 'Ce lien n’a pas pu être ouvert ici. Si vous veniez de confirmer votre adresse, c’est sans doute fait : connectez-vous. Sinon, demandez un nouveau lien.'
    : urlError === 'missing_code'
    ? 'Lien de connexion incomplet. Réessayez.'
    : '';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline()) { setError(offlineMessage()); return; }
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      // Une coupure réseau n'est pas un mauvais mot de passe.
      setError(authFailureMessage(authError) ?? 'Email ou mot de passe incorrect.');
      return;
    }

    if (redirect.startsWith('/dashboard')) {
      try { sessionStorage.setItem(LOGIN_SUCCESS_KEY, '1'); } catch { /* stockage indispo */ }
    }
    // Chargement complet : la page suivante (souvent « Mon espace ») lit son
    // manifeste et la nouvelle session (cf. lib/full-page).
    openFullPage(redirect);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-9">

        <div className="text-center flex flex-col gap-2 animate-stagger-1">
          <div className="relative flex items-center justify-center mb-2">
            <div className="absolute w-16 h-16 rounded-full border border-brand-white/10 animate-ring-pulse" />
            <div className="w-12 h-12 rounded-full border border-brand-white/60 flex items-center justify-center">
              <span aria-hidden="true" className="font-display text-xl font-light">✦</span>
            </div>
          </div>
          <h1 className="font-display text-3xl font-light tracking-[0.06em]">Connexion</h1>
          <p className="font-ui text-sm font-light text-brand-gray/50">
            Accédez à votre espace membre.
          </p>
        </div>

        {resetOk && (
          <div className="w-full px-4 py-3 border border-green-500/25 rounded-[2px] animate-fade-in" role="status">
            <p className="font-ui text-sm text-green-400/80 text-center">Mot de passe mis à jour. Connectez-vous.</p>
          </div>
        )}
        {urlErrorMsg && (
          <div className="w-full px-4 py-3 border border-red-500/20 rounded-[2px] animate-fade-in" role="alert">
            <p className="font-ui text-sm text-red-400/80 text-center">{urlErrorMsg}</p>
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="w-full flex flex-col gap-5 animate-stagger-2">

          <div className="flex flex-col gap-1">
            <label htmlFor="login-email" className="font-ui text-xs text-brand-gray/50 tracking-[0.18em] uppercase">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-base text-brand-white py-3 outline-none transition-colors placeholder:text-brand-gray/50"
              style={{ minHeight: '44px' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="font-ui text-xs text-brand-gray/50 tracking-[0.18em] uppercase">
                Mot de passe
              </label>
              <Link
                href="/auth/forgot-password"
                className="font-ui text-xs text-brand-gray/55 tracking-[0.1em] hover:text-brand-white/80 transition-colors"
              >
                Oublié ?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white font-ui font-light text-base text-brand-white py-3 outline-none transition-colors"
              style={{ minHeight: '44px' }}
            />
          </div>

          {error && (
            <p className="font-ui text-sm text-red-400 text-center" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="animate-shimmer w-full py-4 mt-2 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="flex flex-col items-center gap-3 animate-stagger-3">
          <Link
            href="/register"
            className="font-ui text-sm text-brand-gray/50 tracking-[0.1em] hover:text-brand-white transition-colors"
          >
            Pas encore membre ? Créer un compte
          </Link>
          <Link
            href="/manifeste"
            className="font-ui text-xs text-brand-gray/55 tracking-[0.1em] hover:text-brand-white/80 transition-colors"
          >
            Découvrir In Real Society
          </Link>
          <Link
            href="/"
            className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] underline underline-offset-4 hover:text-brand-white/80 transition-colors"
          >
            &larr; retour &agrave; l&apos;accueil
          </Link>
        </div>

      </div>
    </main>
  );
}
