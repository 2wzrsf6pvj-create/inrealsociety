'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

interface AuthState {
  loggedIn: boolean;
  name: string | null;
  memberId: string | null;
}

const HIDDEN_PATHS = ['/dashboard', '/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password'];

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AuthIndicator() {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>({ loggedIn: false, name: null, memberId: null });
  const [loaded, setLoaded] = useState(false);

  const checkAuth = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setAuth({ loggedIn: false, name: null, memberId: null });
        setLoaded(true);
        return;
      }

      const { data: member } = await supabase
        .from('members')
        .select('id, name')
        .eq('auth_user_id', user.id)
        .single();

      setAuth({
        loggedIn: true,
        name: member?.name ?? user.email?.split('@')[0] ?? null,
        memberId: member?.id ?? null,
      });
    } catch {
      setAuth({ loggedIn: false, name: null, memberId: null });
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    checkAuth();

    // Écoute les changements d'auth (login, logout, token refresh)
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        checkAuth();
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [checkAuth]);

  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return null;
  if (!loaded) return null;

  if (auth.loggedIn) {
    return (
      <Link
        href="/dashboard"
        className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-white/10 bg-brand-black/80 backdrop-blur-sm hover:border-brand-white/25 transition-all duration-300 group"
        aria-label="Aller au dashboard"
      >
        <div className="w-6 h-6 rounded-full border border-brand-white/20 bg-brand-white/5 flex items-center justify-center group-hover:border-brand-white/40 transition-colors">
          <span className="font-ui text-[9px] font-medium text-brand-white/70 tracking-wider">
            {auth.name ? getInitials(auth.name) : '?'}
          </span>
        </div>
        <span className="font-ui text-[10px] text-brand-white/40 tracking-[0.15em] uppercase group-hover:text-brand-white/70 transition-colors">
          Mon espace
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/auth/login"
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-gray/10 bg-brand-black/80 backdrop-blur-sm hover:border-brand-gray/25 transition-all duration-300"
      aria-label="Se connecter"
    >
      <div className="w-6 h-6 rounded-full border border-brand-gray/15 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-gray/30">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <span className="font-ui text-[10px] text-brand-gray/30 tracking-[0.15em] uppercase hover:text-brand-gray/60 transition-colors">
        Connexion
      </span>
    </Link>
  );
}
