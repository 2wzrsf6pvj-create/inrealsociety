import '@/lib/env';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthIndicator from './components/ui/AuthIndicator';
import './globals.css';

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
    icon: '/favicon.svg',
    apple: '/icon.svg',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        {/* Google Fonts — chargées ici pour garantir la dispo globale */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-brand-black">
        <Suspense fallback={null}>
          <AuthIndicator />
          {children}
        </Suspense>
      </body>
    </html>
  );
}