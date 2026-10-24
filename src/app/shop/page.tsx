import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import ShopClient from './ShopClient';
import { APP_URL, OG_IMAGE, TSHIRT_PRICE_EUR, SHIPPING_STANDARD_CENTS, SHIPPING_COUNTRIES } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Boutique',
  description: 'T-shirt In Real Society — Stanley/Stella Creator 2.0, QR code premium imprimé dans le dos. Le premier vêtement conçu pour les rencontres IRL.',
  openGraph: {
    title: 'Boutique — In Real Society',
    description: 'T-shirt In Real Society — Stanley/Stella Creator 2.0, QR code premium imprimé dans le dos.',
    images: [OG_IMAGE],
  },
  alternates: { canonical: '/shop' },
};

// Données produit pour les moteurs (prix, disponibilité, photos) : résultats
// enrichis possibles. Prix = celui affiché, cf. TSHIRT_PRICE_EUR ; port = celui
// facturé (livraison comprise), vers les pays livrés.
const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'T-shirt In Real Society',
  description: 'Stanley/Stella Creator 2.0 en coton bio, QR code imprimé dans le dos\u00a0: quelqu’un vous remarque, scanne et vous écrit. Noir ou blanc, du S au XXL.',
  brand: { '@type': 'Brand', name: 'In Real Society' },
  image: ['tee-noir-dos', 'tee-blanc-dos', 'tee-noir-face', 'tee-blanc-face'].map((f) => `${APP_URL}/shop/${f}.png`),
  offers: {
    '@type': 'Offer',
    price: TSHIRT_PRICE_EUR.toFixed(2),
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock',
    url: `${APP_URL}/shop`,
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: SHIPPING_STANDARD_CENTS / 100, currency: 'EUR' },
      shippingDestination: SHIPPING_COUNTRIES.map((addressCountry) => ({ '@type': 'DefinedRegion', addressCountry })),
    },
  },
};

export default async function ShopPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <Suspense fallback={null}>
        <ShopClient />
      </Suspense>
    </>
  );
}
