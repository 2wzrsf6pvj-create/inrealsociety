// src/lib/order-recap.ts — Récapitulatif d'une commande : page de confirmation
// (/shop/success, via /api/order-code) et email d'activation (webhook Stripe).
// Pur : aucun accès BDD ni Stripe, les appelants fournissent les données.
// Montants en centimes, tels que payés (franchise de TVA : sans TVA).

import { getTagline } from '@/lib/taglines';
import { SHIPPING_STANDARD_CENTS } from '@/lib/constants';

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export interface OrderRecap {
  article:  string;          // « T-shirt Noir · L »
  tagline:  string | null;   // texte imprimé sous le QR ; null = QR seul
  shipping: string | null;   // « Standard · 5,00 € » ; null = inconnu
  total:    string | null;   // « 59,00 € » (port inclus) ; null = inconnu
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

/** 5900 → « 59,00 € » */
export function formatEuros(cents: number): string {
  return EUR.format(cents / 100);
}

// Le mode se déduit du montant : le tarif est fixe (api/shop/checkout).
function shippingText(cents: number): string {
  return cents === SHIPPING_STANDARD_CENTS ? `Standard · ${formatEuros(cents)}` : formatEuros(cents);
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
