import type { Metadata } from 'next';
import ShopClient from './ShopClient';

export const metadata: Metadata = {
  title: 'Boutique',
  description: 'T-shirt In Real Society — Comfort Colors 1717, QR code premium imprimé dans le dos. Le premier vêtement conçu pour les rencontres IRL.',
  openGraph: {
    title: 'Boutique — In Real Society',
    description: 'T-shirt In Real Society — Comfort Colors 1717, QR code premium imprimé dans le dos.',
  },
};

export default function ShopPage() {
  return <ShopClient />;
}
