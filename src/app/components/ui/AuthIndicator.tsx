'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseSessionCookie } from '@/lib/session-cookie';

interface AuthState {
  loggedIn: boolean;
  name: string | null;
  memberId: string | null;
}

// + pages réservées au passant qui scanne (/unlock, /message) : il n'a pas de compte,
// un bouton « Connexion » y est du bruit au moment d'écrire.
const HIDDEN_PATHS = ['/dashboard', '/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password', '/unlock', '/message', '/contact/confirme'];

const LOGGED_OUT: AuthState = { loggedIn: false, name: null, memberId: null };

// Sans cookie de session, le visiteur n'est pas connecté (le passant qui scanne,
// le plus souvent) : inutile de lui télécharger le client Supabase (~56 ko) et
// de l'interroger à chaque page pour afficher « Connexion ».
const hasSessionCookie = () => hasSupabaseSessionCookie(document.cookie);

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AuthIndicator() {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>(LOGGED_OUT);
  const [loaded, setLoaded] = useState(false);
  // Session détectée : le client Supabase est chargé une fois, puis suit la
  // session (onAuthStateChange). Revérifié à chaque page tant qu'il n'y en a pas
  // (la connexion pose le cookie, puis on navigue).
  const [hasSession, setHasSession] = useState(false);

  const checkAuth = useCallback(async (supabase: SupabaseClient) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setAuth(LOGGED_OUT);
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
      setAuth(LOGGED_OUT);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (hasSession) return;
    if (hasSessionCookie()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cookie de session, lu après l'hydratation
      setHasSession(true);
    } else {
      setAuth(LOGGED_OUT);
      setLoaded(true);
    }
  }, [pathname, hasSession]);

  useEffect(() => {
    if (!hasSession) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    import('@/lib/supabase-browser').then(({ createClient }) => {
      if (cancelled) return;
      const supabase = createClient();
      checkAuth(supabase);
      // Écoute les changements d'auth (login, logout, token refresh)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          checkAuth(supabase);
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [hasSession, checkAuth]);

  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return null;
  if (!loaded) return null;

  // Dans une zone « Compte » (repère pour les lecteurs d'écran) ; le lien
  // s'annonce par son texte visible (« Mon espace », « Connexion »), ce que la
  // commande vocale retrouve.
  if (auth.loggedIn) {
    return (
      <nav aria-label="Compte">
        <Link
          href="/dashboard"
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-white/10 bg-brand-black/80 backdrop-blur-sm hover:border-brand-white/25 transition-all duration-300 group"
        >
          <div aria-hidden="true" className="w-6 h-6 rounded-full border border-brand-white/20 bg-brand-white/5 flex items-center justify-center group-hover:border-brand-white/40 transition-colors">
            <span className="font-ui text-xxs font-medium text-brand-white/70 tracking-wider">
              {auth.name ? getInitials(auth.name) : '?'}
            </span>
          </div>
          <span className="font-ui text-xxs text-brand-white/50 tracking-[0.15em] uppercase group-hover:text-brand-white/80 transition-colors">
            Mon espace
          </span>
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Compte">
      <Link
        href="/auth/login"
        className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-gray/10 bg-brand-black/80 backdrop-blur-sm hover:border-brand-gray/25 transition-all duration-300"
      >
        <div aria-hidden="true" className="w-6 h-6 rounded-full border border-brand-gray/15 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-gray/55">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <span className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase hover:text-brand-white/80 transition-colors">
          Connexion
        </span>
      </Link>
    </nav>
  );
}
