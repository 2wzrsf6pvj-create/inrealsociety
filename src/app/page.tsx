import type { Metadata } from 'next';
import LandingClient from './LandingClient';

export const metadata: Metadata = {
  title: 'In Real Society — The IRL Social Club',
  description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie. Pas d\'algorithme. Pas de swipe. Un QR code, une rencontre.',
  openGraph: {
    title: 'In Real Society — The IRL Social Club',
    description: 'Le premier vêtement conçu pour les rencontres dans la vraie vie.',
  },
};

export default function HomePage() {
  return <LandingClient />;
}
