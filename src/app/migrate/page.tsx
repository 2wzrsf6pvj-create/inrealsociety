// src/app/migrate/page.tsx
// Page de migration pour les membres legacy.
// Flow : créer un compte → liaison automatique → dashboard.

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

function friendlyAuthError(code?: string): string {
  switch (code) {
    case 'user_already_exists':
    case 'email_exists': return 'Un compte existe déjà. Connectez-vous puis revenez ici.';
    case 'weak_password': return 'Mot de passe trop faible (8 caractères min).';
    default: return 'Une erreur est survenue. Réessayez.';
  }
}

function MigrateContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const memberId     = searchParams.get('memberId');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  // Si déjà connecté → tenter la liaison directement
  useEffect(() => {
    if (!memberId) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      // Déjà connecté → liaison immédiate
      const res = await fetch('/api/member/link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memberId }),
      });
      if (res.ok) {
        router.push('/dashboard');
      }
    });
  }, [memberId, router]);

  if (!memberId) {
    return (
      <p className="font-ui text-[0.62rem] text-brand-gray/40 text-center">
        Lien invalide. Vérifiez votre email.
      </p>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Mot de passe trop court (8 caractères min).'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }

    setLoading(true);
    setError('');

    const supabase = createClient();

    // 1. Créer le compte Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/migrate?memberId=${memberId}` },
    });

    if (authError) { setLoading(false); setError(friendlyAuthError(authError.code)); return; }

    // Si confirmation email requise
    if (!data.session) {
      setLoading(false);
      setDone(true);
      return;
    }

    // 2. Lier le profil legacy au nouveau compte
    const res = await fetch('/api/member/link', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberId }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Erreur de liaison.');
      return;
    }

    router.push('/dashboard');
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
        <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">Vérifiez votre email.</h2>
        <p className="font-ui text-[0.62rem] font-light text-brand-gray/50 leading-relaxed">
          Cliquez sur le lien de confirmation, puis revenez sur cette page.
        </p>
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="text-center flex flex-col gap-2">
        <h2 className="font-display text-[1.8rem] font-light tracking-[0.06em]">Sécurisez votre profil.</h2>
        <p className="font-ui text-[0.55rem] font-light text-brand-gray/40 leading-relaxed">
          Créez un mot de passe pour protéger votre compte.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
        <div className="flex flex-col gap-1">
          <label className="font-ui text-[0.48rem] text-brand-gray/30 tracking-[0.2em] uppercase">Confirmer</label>
          <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/60 font-ui font-light text-[0.82rem] text-brand-white py-3 outline-none transition-colors"
            style={{ minHeight: '44px' }} />
        </div>

        {error && <p className="font-ui text-[0.58rem] text-red-400 text-center">{error}</p>}

        <button type="submit" disabled={loading}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
          style={{ minHeight: '44px' }}>
          {loading ? 'Sécurisation...' : 'Créer mon mot de passe →'}
        </button>
      </form>
    </div>
  );
}

export default function MigratePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="z-10 w-full max-w-xs">
        <React.Suspense fallback={null}>
          <MigrateContent />
        </React.Suspense>
      </div>
    </main>
  );
}