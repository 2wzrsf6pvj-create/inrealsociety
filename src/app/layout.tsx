import '@/lib/env';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cormorant_Garamond, Montserrat } from 'next/font/google';
import AuthIndicator from './components/ui/AuthIndicator';
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
    <html lang="fr" className={`${cormorant.variable} ${montserrat.variable}`}>
      <head />
      <body className="antialiased bg-brand-black">
        <Suspense fallback={null}>
          <AuthIndicator />
        </Suspense>
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}