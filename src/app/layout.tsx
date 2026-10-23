import '@/lib/env';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { Cormorant_Garamond, Montserrat } from 'next/font/google';
import AuthIndicator from './components/ui/AuthIndicator';
import PostHogProvider from './components/PostHogProvider';
import ConsentBanner from './components/ConsentBanner';
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration';
import SunScope from './components/ui/SunScope';
import PageTransition from './components/ui/PageTransition';
import { APP_URL } from '@/lib/constants';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-ui',
  display: 'swap',
});

export const metadata: Metadata = {
  // Adresse officielle : les URL relatives (images d'aperçu, canoniques) en
  // dérivent. Sans elle, Next prenait l'adresse technique du déploiement Vercel.
  metadataBase: new URL(APP_URL),
  title: {
    default:  'In Real Society — The IRL Social Club',
    template: '%s — In Real Society',
  },
  description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie. Pas d\'algorithme. Pas de swipe. Un QR code, une rencontre.',
  openGraph: {
    title:       'In Real Society',
    description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie.',
    siteName:    'In Real Society',
    locale:      'fr_FR',
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'In Real Society',
    description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie.',
  },
  icons: {
    icon:  '/favicon.svg',
    apple: '/icon.svg',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable:       true,
    title:         'In Real Society',
    statusBarStyle: 'black-translucent',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce CSP posé par le proxy (header de requête x-nonce). Permet au
  // script inline ci-dessous de passer la CSP stricte à nonce sans 'unsafe-inline'.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // data-scroll-behavior : Next 16 ne coupe plus de lui-même le défilement doux
    // (globals.css) pendant un changement de page ; sans lui, chaque navigation
    // remonterait la page en glissant au lieu d'arriver directement en haut.
    <html lang="fr" className={`${cormorant.variable} ${montserrat.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Mode plein soleil : applique la classe avant le paint (anti-FOUC),
            UNIQUEMENT sur le parcours scanneur (profil/message/conversation).
            Noncé pour la CSP stricte. SunScope gère ensuite les navigations client. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('irs_sun')==='1'&&/^\\/(profil|message|conversation)(\\/|$)/.test(location.pathname))document.documentElement.classList.add('sun')}catch(e){}" }} />
      </head>
      <body className="antialiased bg-brand-black">
        <a href="#main" className="skip-link">Aller au contenu principal</a>
        <ServiceWorkerRegistration />
        <SunScope />
        <Suspense fallback={null}>
          <PostHogProvider>
            <AuthIndicator />
            <div id="main"><PageTransition>{children}</PageTransition></div>
            <ConsentBanner />
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}