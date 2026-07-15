// src/lib/gelato.ts
// Portage POD Gelato — alternative EU à Printful (fulfillment fabriqué en Europe,
// livraison FR 3-5 j). Activé via `FULFILLMENT_PROVIDER=gelato` (défaut : printful).
//
// La génération QR + monogramme + upload Supabase est PROVIDER-AGNOSTIC (cf.
// fulfillment.ts) ; seule la CRÉATION de commande diffère et vit ici.
//
// ⚠️ À VÉRIFIER avec une vraie GELATO_API_KEY avant de basculer en prod :
//   1. Les 10 `GELATO_PRODUCT_UID_{DARK|LIGHT}_{S..XXL}` → scripts/gelato-variants.mjs.
//   2. Le `shipmentMethodUid` (Gelato : 'normal' | 'express' | 'standard'… selon le compte).
//   3. Le CONTRÔLE DE TAILLE du print (Gelato pose le fichier dans la zone du placement ;
//      la taille exacte du QR — 25 cm pour ~2,5 m — dépend du template/produit. Certains POD
//      auto-ajustent → à valider sur un échantillon. Cf. [[Backlog]]).
//   4. Le mapping des statuts (getGelatoTracking) et l'annulation (cancelGelatoOrder)
//      AVANT de basculer, sinon /commande et le refund→cancel ne suivront pas.
//
// Réf. API : POST https://order.gelatoapis.com/v4/orders (X-API-KEY, items[].files[{type,url}]).

import type { PrintfulAddress } from '@/lib/printful.types';

type TshirtColor = 'dark' | 'light';
type TshirtSize  = 'S' | 'M' | 'L' | 'XL' | 'XXL';

const GELATO_ORDER_API = 'https://order.gelatoapis.com/v4';

/**
 * productUid Gelato = chaîne STRUCTURÉE encodant blank + taille + couleur (≠ variant_id
 * numérique Printful). Ex. `apparel_product_gca_t-shirt_…_gsi_s_gco_white_gpr_4-4`.
 * Résolu par (couleur × taille) via GELATO_PRODUCT_UID_{DARK|LIGHT}_{S..XXL}.
 * Fallback legacy mono-taille (comme Printful). Les sortir : scripts/gelato-variants.mjs.
 */
export function getGelatoProductUid(color: TshirtColor, size: TshirtSize): string | null {
  const c = color === 'dark' ? 'DARK' : 'LIGHT';
  const perSize = process.env[`GELATO_PRODUCT_UID_${c}_${size}`];
  const legacy  = color === 'dark' ? process.env.GELATO_PRODUCT_UID_DARK : process.env.GELATO_PRODUCT_UID_LIGHT;
  return (perSize || legacy || '').trim() || null;
}

/**
 * Gelato exige firstName/lastName SÉPARÉS + email + country ISO. Printful n'a qu'un
 * `name` unique et pas d'email dans l'adresse → on splitte le nom et on injecte l'email
 * de l'acheteur (récupéré de la session Stripe côté fulfillment).
 */
function toGelatoAddress(addr: PrintfulAddress, email: string) {
  const parts     = addr.name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || addr.name;
  const lastName  = parts.join(' ') || firstName;   // Gelato refuse un lastName vide
  return {
    firstName,
    lastName,
    addressLine1: addr.address1,
    addressLine2: addr.address2 || undefined,
    city:         addr.city,
    state:        addr.state_code || undefined,
    postCode:     addr.zip,
    country:      addr.country_code,   // ISO 2 lettres, comme Printful
    email,
  };
}

export interface GelatoOrderResult {
  ok:              boolean;
  providerOrderId?: string;
  reason?:         string;
}

/**
 * Crée la commande de production chez Gelato. `orderReferenceId` = notre order.id
 * (clé d'idempotence côté app ; ⚠️ confirmer que Gelato dédoublonne dessus, sinon
 * gérer l'idempotence en amont comme pour Printful).
 */
export async function createGelatoOrder(params: {
  orderId:  string;
  email:    string;
  recipient: PrintfulAddress;
  color:    TshirtColor;
  size:     TshirtSize;
  backUrl:  string;          // QR (+ accroche) — dos
  frontUrl: string | null;   // monogramme )( — poitrine (si PRINT_FRONT_LOGO)
}): Promise<GelatoOrderResult> {
  const key = process.env.GELATO_API_KEY;
  if (!key) return { ok: false, reason: 'no_gelato_api_key' };

  const productUid = getGelatoProductUid(params.color, params.size);
  if (!productUid) return { ok: false, reason: 'no_gelato_product_uid' };

  // Placement Gelato : 'default' = FACE, 'back' = DOS (pas de coordonnées px comme
  // Printful — Gelato pose le fichier dans la zone du placement). SVG accepté.
  const files: Array<{ type: 'default' | 'back'; url: string }> = [
    { type: 'back', url: params.backUrl },
    ...(params.frontUrl ? [{ type: 'default' as const, url: params.frontUrl }] : []),
  ];

  const body = {
    orderType:           'order',
    orderReferenceId:    params.orderId,
    customerReferenceId: params.email,
    currency:            'EUR',
    items: [{
      itemReferenceId: `${params.orderId}-tee`,
      productUid,
      files,
      quantity: 1,
    }],
    shipmentMethodUid: process.env.GELATO_SHIPMENT_METHOD_UID || 'normal',
    shippingAddress:   toGelatoAddress(params.recipient, params.email),
  };

  let res: Response;
  try {
    res = await fetch(`${GELATO_ORDER_API}/orders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body:    JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, reason: `gelato_network: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `gelato_${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json() as { id?: string };
  return { ok: true, providerOrderId: String(data.id ?? '') };
}

// ─── Suivi & annulation (à FINALISER avant bascule prod) ───────────────────────
// Équivalents Gelato de getPrintfulTracking / cancelPrintfulOrder. Structure posée ;
// le MAPPING des statuts Gelato → l'objet attendu par /commande reste à écrire quand
// on aura un vrai order de test (les libellés de statut Gelato diffèrent de Printful).

export interface GelatoTrackingResult {
  fulfillmentStatus: string | null;   // ex. 'printed' | 'shipped' | 'canceled'…
  shipments: Array<{ carrier: string | null; trackingCode: string | null; trackingUrl: string | null }>;
}

/** GET /v4/orders/{id} — statut de production + expéditions. */
export async function getGelatoTracking(gelatoOrderId: string): Promise<GelatoTrackingResult | null> {
  const key = process.env.GELATO_API_KEY;
  if (!key || !gelatoOrderId) return null;
  try {
    const res = await fetch(`${GELATO_ORDER_API}/orders/${encodeURIComponent(gelatoOrderId)}`, {
      headers: { 'X-API-KEY': key },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      fulfillmentStatus?: string;
      shipments?: Array<{ fulfillmentCountry?: string; trackingCode?: string; trackingUrl?: string; shipmentMethodName?: string }>;
    };
    return {
      fulfillmentStatus: data.fulfillmentStatus ?? null,
      shipments: (data.shipments ?? []).map((s) => ({
        carrier:      s.shipmentMethodName ?? null,
        trackingCode: s.trackingCode ?? null,
        trackingUrl:  s.trackingUrl ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export interface GelatoCancelResult { canceled: boolean; reason?: string }

/** POST /v4/orders/{id}:cancel — annulation (ex. sur refund). Fail-soft, ne throw jamais. */
export async function cancelGelatoOrder(gelatoOrderId: string): Promise<GelatoCancelResult> {
  const key = process.env.GELATO_API_KEY;
  if (!key || !gelatoOrderId) return { canceled: false, reason: 'no_key_or_id' };
  try {
    const res = await fetch(`${GELATO_ORDER_API}/orders/${encodeURIComponent(gelatoOrderId)}:cancel`, {
      method:  'POST',
      headers: { 'X-API-KEY': key },
    });
    if (res.ok) return { canceled: true };
    return { canceled: false, reason: `gelato_${res.status}` };
  } catch (e) {
    return { canceled: false, reason: `gelato_network: ${(e as Error).message}` };
  }
}
