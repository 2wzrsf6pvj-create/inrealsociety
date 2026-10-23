'use client';

// DashboardClient — orchestrateur du dashboard membre.
// Les sections sont extraites dans ./components/{Home,Inbox,Settings}Section.tsx
// pour garder ce fichier focalisé sur l'auth/tabs/toast logic.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { captureEvent, identifyMember } from '@/lib/posthog-client';
import { LOGIN_SUCCESS_KEY } from '@/lib/constants';
import type { Member, Scan, Message } from '@/lib/types';
import HomeSection from './components/HomeSection';
import InboxSection from './components/InboxSection';
import SettingsSection from './components/SettingsSection';
import OnboardingOverlay from './components/OnboardingOverlay';

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
  const activeIndex = tabs.findIndex(t => t.key === active);

  return (
    <div role="tablist" aria-label="Sections du dashboard" className="relative w-full flex border-b border-brand-gray/10 mb-2">
      {tabs.map(tab => (
        <button
          key={tab.key}
          role="tab"
          id={`tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls={`panel-${tab.key}`}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-3 font-ui text-xs tracking-[0.2em] uppercase transition-colors relative ${
            active === tab.key ? 'text-brand-white' : 'text-brand-gray/55 hover:text-brand-white/80'
          }`}
        >
          {/* Le badge est ancré au LABEL (span relatif) et non au bouton, sinon
              il se centrait sur l'onglet et débordait visuellement sur Accueil. */}
          <span className="relative inline-block">
            {tab.label}
            {tab.badge && tab.badge > 0 ? (
              <span className="animate-ping-badge absolute -top-1.5 -right-4 w-4 h-4 bg-red-500 text-red-500 rounded-full flex items-center justify-center text-xxs text-white font-bold z-10"
                    aria-label={`${tab.badge} messages non lus`}>
                <span className="relative z-10 text-white">{tab.badge > 9 ? '9+' : tab.badge}</span>
              </span>
            ) : null}
          </span>
        </button>
      ))}
      {/* Soulignement actif qui GLISSE d'un onglet à l'autre (au lieu de sauter) */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-px bg-brand-white transition-transform duration-300 ease-out"
        style={{ width: `${100 / tabs.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
      />
    </div>
  );
}

export default function DashboardClient({
  member,
  recentScans,
  messages,
  unreadCount,
  activeConversations = 0,
  recentConversations = 0,
  totalConversations = 0,
  scansByDay = [],
  weekScans = 0,
}: {
  member:               Member;
  recentScans:          Scan[];
  messages:             Message[];
  unreadCount:          number;
  activeConversations?: number;
  // Conversations qui occupent le plafond (fenêtre glissante) — cf. getActiveConversationsCount.
  recentConversations?: number;
  totalConversations?:  number;
  scansByDay?:          { date: string; count: number }[];
  /** Scans des 7 derniers jours (même fenêtre que le graphique premium). */
  weekScans?:           number;
}) {
  const [tab, setTab]     = useState<Tab>('home');
  const [toast, setToast] = useState('');
  const [toastHiding, setToastHiding] = useState(false);
  // Retour du paiement premium, confirmation de Stripe pas encore reçue.
  const [awaitingPremium, setAwaitingPremium] = useState(false);
  const router = useRouter();

  // Onglet reflété dans l'URL (?tab=) → deep-linkable et partageable. On lit au
  // mount (post-hydratation pour éviter tout mismatch SSR) et on met à jour via
  // replaceState (pas de refetch serveur, pas de pollution de l'historique).
  const isTab = (v: string | null): v is Tab => v === 'home' || v === 'inbox' || v === 'settings';
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- onglet lu dans l'URL après l'hydratation
    if (isTab(t)) setTab(t);
  }, []);
  const changeTab = React.useCallback((t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.toString());
  }, []);

  // Bandeau « Voir l'offre » de l'onglet Messages → offre premium des réglages
  // (prix, avantages, CGV), une fois l'onglet affiché.
  const scrollToPremium = React.useRef(false);
  const goToPremium = React.useCallback(() => {
    scrollToPremium.current = true;
    changeTab('settings');
  }, [changeTab]);
  React.useEffect(() => {
    if (tab !== 'settings' || !scrollToPremium.current) return;
    scrollToPremium.current = false;
    document.getElementById('premium')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tab]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- message laissé dans sessionStorage
      return showToast('Profil mis à jour.', 3000);
    }

    // Retour du paiement premium. La confirmation de Stripe (webhook) peut
    // arriver après la page : on attend alors le premium (effet plus bas).
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      // Même page, sans le paramètre : l'attente du premium (plus bas) recharge
      // les données de CETTE page.
      window.history.replaceState({}, '', window.location.pathname);
      if (member.plan === 'premium') return showToast('✦ Bienvenue dans le cercle premium.', 4000);
      setAwaitingPremium(true);
      return showToast('Paiement reçu. Activation du premium…', 4000);
    }

    // Célébration du TOUT PREMIER scan (une seule fois, persistée). Gardé à
    // scan_count === 1 pour ne pas se déclencher chez les membres déjà actifs.
    if (member.scan_count === 1) {
      try {
        if (!localStorage.getItem('irs_first_scan_seen')) {
          localStorage.setItem('irs_first_scan_seen', '1');
          return showToast('✦ Premier scan reçu. On vous a remarqué·e.', 4500);
        }
      } catch { /* stockage indispo */ }
    }

    // Toast connexion réussie — message neutre (l'en-tête salue déjà par le nom,
    // un toast « Bienvenue {nom} » ferait doublon). Seulement juste après la page
    // de connexion : il s'affichait à chaque nouvelle session du navigateur, donc
    // à chaque ouverture de l'app installée sur l'écran d'accueil.
    let justLoggedIn = false;
    try {
      justLoggedIn = !!sessionStorage.getItem(LOGIN_SUCCESS_KEY);
      sessionStorage.removeItem(LOGIN_SUCCESS_KEY);
    } catch { /* stockage indispo */ }
    if (justLoggedIn) return showToast('Connexion réussie.', 2500);
  }, [member.name, member.scan_count, member.plan, showToast]);

  // Premium en attente de confirmation : on recharge les données du serveur toutes
  // les 2 s, 20 s au plus. Avant, le toast de bienvenue s'affichait sur une page
  // encore en gratuit, avec « Passer premium » qui ne répondait plus.
  React.useEffect(() => {
    if (!awaitingPremium) return;
    if (member.plan === 'premium') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fin de l'attente, constatée sur les données rechargées
      setAwaitingPremium(false);
      showToast('✦ Bienvenue dans le cercle premium.', 4000);
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 10) {
        clearInterval(timer);
        setAwaitingPremium(false);
        showToast('L’activation prend plus de temps que prévu : rechargez la page dans un instant.', 5000);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [awaitingPremium, member.plan, router, showToast]);

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-brand-black text-brand-white px-6 py-8 overflow-hidden">
      {/* Onboarding première ouverture (porteur) — vu une fois */}
      <OnboardingOverlay name={member.name} />

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
            <HomeSection member={member} recentScans={recentScans} scansByDay={scansByDay} weekScans={weekScans} messages={messages} activeConversations={activeConversations} />
          )}

          {tab === 'inbox' && (
            <InboxSection
              messages={messages}
              memberId={member.id}
              plan={member.plan}
              recentConversations={recentConversations}
              totalConversations={totalConversations}
              onUpgrade={goToPremium}
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
