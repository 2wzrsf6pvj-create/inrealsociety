// src/lib/order-recap.ts — Récapitulatif d'une commande : page de confirmation
// (/shop/success, via /api/order-code) et email d'activation (webhook Stripe).
// Pur : aucun accès BDD ni Stripe, les appelants fournissent les données.
// Montants en centimes, tels que payés (franchise de TVA : sans TVA).

import { getTagline } from '@/lib/taglines';

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export interface OrderRecap {
  article:  string;          // « T-shirt Noir · L »
  tagline:  string | null;   // texte imprimé sous le QR ; null = QR seul
  shipping: string | null;   // « Comprise » ; null = inconnu
  total:    string | null;   // « 49,00 € » ; null = inconnu
  address:  string | null;   // adresse de livraison sur une ligne ; null = inconnue
}

/** Sous-ensemble de PrintfulAddress (cf. getShippingDetails dans fulfillment). */
export interface RecapAddress {
  name:         string;
  address1:     string;
  address2?:    string;
  zip:          string;
  city:         string;
  country_code: string;
}

/** 4900 → « 49,00 € » */
export function formatEuros(cents: number): string {
  return EUR.format(cents / 100);
}

// Livraison comprise dans le prix (api/shop/checkout) : 0 € s'écrit « Comprise ».
// Un port payé (commande passée avant la livraison comprise) s'affiche en euros.
function shippingText(cents: number): string {
  return cents === 0 ? 'Comprise' : formatEuros(cents);
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;   // code vide ou invalide
  }
}

function formatAddress(a: RecapAddress): string {
  return [a.name, a.address1, a.address2, `${a.zip} ${a.city}`.trim(), countryName(a.country_code)]
    .filter(Boolean)
    .join(', ');
}

export function buildOrderRecap(input: {
  color:          string | null | undefined;
  size:           string | null | undefined;
  taglineId:      string | null | undefined;
  totalCents?:    number | null;
  shippingCents?: number | null;
  address?:       RecapAddress | null;
}): OrderRecap {
  const color = input.color === 'light' ? 'Blanc' : 'Noir';
  const size  = input.size && SIZES.includes(input.size) ? ` · ${input.size}` : '';
  return {
    article:  `T-shirt ${color}${size}`,
    tagline:  getTagline(input.taglineId)?.text ?? null,
    shipping: input.shippingCents == null ? null : shippingText(input.shippingCents),
    total:    input.totalCents    == null ? null : formatEuros(input.totalCents),
    address:  input.address ? formatAddress(input.address) : null,
  };
}
