'use client';

// DashboardClient — orchestrateur du dashboard membre.
// Les sections sont extraites dans ./components/{Home,Inbox,Settings}Section.tsx
// pour garder ce fichier focalisé sur l'auth/tabs/toast logic.

import React, { useState } from 'react';
import { captureEvent, identifyMember } from '@/lib/posthog-client';
import type { Member, Scan, Message } from '@/lib/types';
import HomeSection from './components/HomeSection';
import InboxSection from './components/InboxSection';
import SettingsSection from './components/SettingsSection';

type Tab = 'home' | 'inbox' | 'settings';

function TabBar({ active, onChange, unreadCount }: {
  active: Tab;
  onChange: (tab: Tab) => void;
  unreadCount: number;
}) {
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'home',     label: 'Accueil' },
    { key: 'inbox',    label: 'Messages', badge: unreadCount },
    { key: 'settings', label: 'Réglages' },
  ];

  return (
    <div role="tablist" aria-label="Sections du dashboard" className="w-full flex border-b border-brand-gray/10 mb-2">
      {tabs.map(tab => (
        <button
          key={tab.key}
          role="tab"
          id={`tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls={`panel-${tab.key}`}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-3 font-ui text-xs tracking-[0.2em] uppercase transition-colors relative ${
            active === tab.key ? 'text-brand-white border-b border-brand-white' : 'text-brand-gray/55 hover:text-brand-white/80'
          }`}
        >
          {tab.label}
          {tab.badge && tab.badge > 0 ? (
            <span className="animate-ping-badge absolute top-2 right-[calc(50%-16px)] w-4 h-4 bg-red-500 text-red-500 rounded-full flex items-center justify-center text-xxs text-white font-bold z-10"
                  aria-label={`${tab.badge} messages non lus`}>
              <span className="relative z-10 text-white">{tab.badge > 9 ? '9+' : tab.badge}</span>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export default function DashboardClient({
  member,
  recentScans,
  messages,
  unreadCount,
  activeConversations = 0,
  totalConversations = 0,
  scansByDay = [],
}: {
  member:               Member;
  recentScans:          Scan[];
  messages:             Message[];
  unreadCount:          number;
  activeConversations?: number;
  totalConversations?:  number;
  scansByDay?:          { date: string; count: number }[];
}) {
  const [tab, setTab]     = useState<Tab>('home');
  const [toast, setToast] = useState('');
  const [toastHiding, setToastHiding] = useState(false);

  // Onglet reflété dans l'URL (?tab=) → deep-linkable et partageable. On lit au
  // mount (post-hydratation pour éviter tout mismatch SSR) et on met à jour via
  // replaceState (pas de refetch serveur, pas de pollution de l'historique).
  const isTab = (v: string | null): v is Tab => v === 'home' || v === 'inbox' || v === 'settings';
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (isTab(t)) setTab(t);
  }, []);
  const changeTab = React.useCallback((t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.toString());
  }, []);

  // Affiche un toast avec entrée + sortie animée. La sortie est déclenchée
  // après `durationMs` puis l'unmount effectif arrive 300ms plus tard
  // (durée de animate-toast-out dans globals.css).
  const showToast = React.useCallback((message: string, durationMs: number) => {
    setToastHiding(false);
    setToast(message);
    const hideAt   = setTimeout(() => setToastHiding(true), durationMs);
    const unmount  = setTimeout(() => { setToast(''); setToastHiding(false); }, durationMs + 300);
    return () => { clearTimeout(hideAt); clearTimeout(unmount); };
  }, []);

  React.useEffect(() => {
    identifyMember(member.id, {
      plan:       member.plan,
      scan_count: member.scan_count,
    });
    captureEvent('member_dashboard_viewed', {
      member_id:  member.id,
      plan:       member.plan,
      scan_count: member.scan_count,
    });
  }, [member.id, member.plan, member.scan_count]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // Toast profil mis à jour
    const updated = sessionStorage.getItem('profile_updated');
    if (updated) {
      sessionStorage.removeItem('profile_updated');
      return showToast('Profil mis à jour.', 3000);
    }

    // Toast upgrade premium
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      window.history.replaceState({}, '', '/dashboard');
      return showToast('✦ Bienvenue dans le cercle premium.', 4000);
    }

    // Toast connexion réussie — message neutre (l'en-tête salue déjà par le nom,
    // un toast « Bienvenue {nom} » ferait doublon).
    const justLoggedIn = sessionStorage.getItem('just_logged_in');
    if (!justLoggedIn) {
      sessionStorage.setItem('just_logged_in', '1');
      return showToast('Connexion réussie.', 2500);
    }
  }, [member.name, showToast]);

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-brand-black text-brand-white px-6 py-8 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)' }} />

      {/* Toast notification — entrée animate-stagger-1, sortie animate-toast-out */}
      {toast && (
        <div className={`fixed top-4 z-50 px-4 py-2 bg-brand-white/10 border border-brand-white/20 rounded-[2px] backdrop-blur-sm ${toastHiding ? 'animate-toast-out' : 'animate-stagger-1'}`}>
          <p className="font-ui text-sm text-brand-white/80">{toast}</p>
        </div>
      )}

      <div className="z-10 flex flex-col items-center w-full max-w-xs md:max-w-sm gap-6">

        {/* Header */}
        <div className="text-center flex flex-col gap-2">
          <h2 className="font-display text-3xl font-light tracking-[0.06em]">
            Bienvenue<br /><span className="font-semibold">{member.name}.</span>
          </h2>
          <p className="font-ui text-sm font-light text-brand-gray/50 tracking-[0.1em]">
            {member.is_paused
              ? 'Profil en pause.'
              : member.scan_count > 0
                ? 'Votre vêtement est actif.'
                : 'Votre profil est prêt. Portez votre t-shirt.'}
          </p>
        </div>

        {/* Tabs */}
        <TabBar active={tab} onChange={changeTab} unreadCount={unreadCount} />

        {/* Tab content with transition */}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="w-full animate-stagger-1" key={tab}>
          {tab === 'home' && (
            <HomeSection member={member} recentScans={recentScans} scansByDay={scansByDay} messages={messages} activeConversations={activeConversations} />
          )}

          {tab === 'inbox' && (
            <InboxSection
              messages={messages}
              memberId={member.id}
              plan={member.plan}
              activeConversations={activeConversations}
              totalConversations={totalConversations}
            />
          )}

          {tab === 'settings' && (
            <SettingsSection member={member} />
          )}
        </div>

      </div>
    </main>
  );
}
