import '@/lib/env';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cormorant_Garamond, Montserrat } from 'next/font/google';
import AuthIndicator from './components/ui/AuthIndicator';
import PostHogProvider from './components/PostHogProvider';
import ConsentBanner from './components/ConsentBanner';
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration';
import SunScope from './components/ui/SunScope';
import PageTransition from './components/ui/PageTransition';
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
  title: {
    default:  'In Real Society — The IRL Social Club',
    template: '%s — In Real Society',
  },
  description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie. Pas d\'algorithme. Pas de swipe. Un QR code, une rencontre.',
  openGraph: {
    title:       'In Real Society',
    description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie.',
    url:         'https://inrealsociety.com',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${cormorant.variable} ${montserrat.variable}`} suppressHydrationWarning>
      <head>
        {/* Mode plein soleil : applique la classe avant le paint (anti-FOUC),
            UNIQUEMENT sur le parcours scanneur (profil/message/conversation).
            'unsafe-inline' est déjà autorisé par la CSP. SunScope gère ensuite
            les navigations client. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('irs_sun')==='1'&&/^\\/(profil|message|conversation)(\\/|$)/.test(location.pathname))document.documentElement.classList.add('sun')}catch(e){}" }} />
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