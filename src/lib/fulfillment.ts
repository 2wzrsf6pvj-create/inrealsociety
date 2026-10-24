// Fulfillment : génère le QR code premium d'un membre, l'upload dans Supabase
// Storage, puis crée la commande Printful en utilisant order.id comme external_id
// (idempotence Printful native).
//
// Appelé depuis deux endroits :
//   1. /api/webhook/stripe — quand un membre existant achète un t-shirt (userId
//      présent dans la metadata Stripe)
//   2. /api/member/create — après qu'un nouveau client a activé son code et
//      créé son profil. C'est le chemin principal pour les nouveaux acheteurs,
//      car au moment du paiement on n'a pas encore de member_id.

import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { composeBackPrintSVG, generateBrandMonogramSVG } from '@/lib/generate-qr-svg';
import { QR_STYLE_CORNER, DEFAULT_QR_STYLE, PRINT_FRONT_LOGO, FULFILLMENT_PROVIDER, type QrStyleKey } from '@/lib/constants';
import { createGelatoOrder } from '@/lib/gelato';
import { livePayments } from '@/lib/payments-mode';
import { audit } from '@/lib/audit';
import { buildShortUrl, generateUniqueShortCode } from '@/lib/short-code';
import type { PrintfulOrderPayload, PrintfulOrderResponse, PrintfulAddress } from '@/lib/printful.types';

type TshirtColor = 'dark' | 'light';
type TshirtSize  = 'S' | 'M' | 'L' | 'XL' | 'XXL';

// ─── Zones d'impression Printful ──────────────────────────────────────────────
// Coordonnées en px dans le repère de la zone d'impression.
// ⚠️ À VALIDER dans le Mockup Generator PUIS sur un échantillon physique : un
// `position` faux = QR décentré/mal dimensionné, ou logo du mauvais côté.
// 1800 px = 12" = 30,48 cm de large (DTG adulte, 150 DPI) → 59,06 px/cm.
const PRINT_AREA = { area_width: 1800, area_height: 2400 } as const;
const PX_PER_CM = 1800 / 30.48;

/**
 * DOS : le QR, dimensionné pour la DISTANCE DE SCAN, pas pour l'esthétique.
 *
 * La distance de lecture fiable ≈ **10× la largeur du QR** (le capteur doit
 * résoudre chaque module) — et ce ratio tombe à ~7:1 en lumière faible.
 *
 *   800 px  = 11,9 cm de données → ~1,2 m. Un inconnu devait s'approcher à un bras.
 *   1476 px = 25,0 cm            → ~2,5 m en bonne lumière, ~1,8 m le soir.
 *
 * ⚠️ Un 2,5 m garanti EN TOUTES CONDITIONS demanderait 36 cm : impossible sur une
 * zone de 30,5 cm. Il faudrait un produit à zone 16" (40,6 cm).
 *
 * Le QR est imprimé SANS quiet zone (`PRINT_QUIET_MODULES = 0`) : le fond est
 * transparent, donc le tissu la fournit — à l'infini, et gratuitement. Les 2 modules
 * de marge qu'on imprimait mangeaient 12 % de la largeur utile.
 * ⚠️ Corollaire : ne RIEN imprimer d'autre dans les ~3,5 cm autour du QR.
 */
const BACK_TARGET_SCAN_M = 2.5;                               // objectif produit
const BACK_WIDTH_CM      = BACK_TARGET_SCAN_M * 100 / 10;     // règle 10:1 → 25 cm
const BACK_WIDTH_PX      = Math.round(BACK_WIDTH_CM * PX_PER_CM);  // 1476 px
export const BACK_POSITION = {
  ...PRINT_AREA,
  width:  BACK_WIDTH_PX,
  height: BACK_WIDTH_PX,                                      // le QR est carré
  top:    300,                                                // haut du dos, sous la nuque
  left:   Math.round((PRINT_AREA.area_width - BACK_WIDTH_PX) / 2),  // centré : 150
};

/** Le print ne porte pas sa quiet zone : le tissu la fournit. Cf. BACK_POSITION. */
export const PRINT_QUIET_MODULES = 0;

/**
 * Modules attendus pour une URL courte (`https://inreal.me/<code>`, ECC-H → v3).
 * C'est l'hypothèse derrière `BACK_WIDTH_CM`. Au-delà, la portée promise n'est plus
 * tenue — `fulfillOrder` le signale.
 */
export const NOMINAL_QR_MODULES = 29;

/** FACE : lockup )( + « IN REAL SOCIETY », POITRINE GAUCHE DU PORTEUR.
 *  Le lockup est PAYSAGE (nom sur une ligne) → largeur ~9 cm pour que le nom se lise.
 *  Hauteur dérivée du ratio réel du fichier (cf. fulfillOrder) — ne pas figer un carré,
 *  sinon Printful déforme. `left` place le centre côté poitrine gauche du porteur
 *  (à DROITE de l'image vue de face).
 *  ⚠️ À VALIDER dans le Mockup Generator (taille/centrage du print poitrine). */
const FRONT_WIDTH_PX = Math.round(9 * PX_PER_CM);   // ~531 px ≈ 9 cm
const FRONT_CENTER_X = 1180;                         // centre du print, poitrine gauche du porteur
const FRONT_TOP      = 400;

const VALID_SIZES: readonly string[] = ['S', 'M', 'L', 'XL', 'XXL'];
function coerceSize(raw: string | null | undefined): TshirtSize {
  return (VALID_SIZES.includes(raw ?? '') ? raw : 'M') as TshirtSize;
}

/** Chemin de stockage du QR d'une commande imprimée AVANT activation (pas encore
 *  de membre). Déterministe → l'activation peut recomposer l'URL publique pour la
 *  pointer sur `members.qr_code_url` sans nouvelle génération. */
export function orderQrStoragePath(orderId: string, color: TshirtColor): string {
  return `orders/${orderId}/qr-${color}.svg`;
}

interface FulfillmentParams {
  orderId:     string;
  // Optionnel : présent = fulfillment lié à un membre (rachat, ou activation en
  // mode `FULFILL_ON_PAYMENT=false`). Absent/null = impression AU PAIEMENT, avant
  // toute activation → le QR encode `orders.short_code` (réservé au webhook).
  memberId?:   string | null;
  tshirtColor: TshirtColor;
  tshirtSize:  string;   // brut (S/M/L/XL/XXL) ; coercé en interne, défaut M
}

interface FulfillmentResult {
  ok:                boolean;
  alreadyFulfilled?: boolean;
  reason?:           string;
  printfulOrderId?:  string;
}

// Un variant_id Printful encode À LA FOIS la couleur ET la taille. On résout donc
// par (couleur × taille) via PRINTFUL_VARIANT_ID_{DARK|LIGHT}_{S|M|L|XL|XXL}.
// Fallback legacy (déploiements mono-taille) : PRINTFUL_VARIANT_ID_{DARK|LIGHT}
// puis PRINTFUL_VARIANT_ID. Sans l'env par taille, TOUTES les commandes partaient
// à la taille figée dans le fallback → bug « tout le monde reçoit la même taille ».
function getVariantId(color: TshirtColor, size: TshirtSize): number {
  const c = color === 'dark' ? 'DARK' : 'LIGHT';
  const perSize = process.env[`PRINTFUL_VARIANT_ID_${c}_${size}`];
  const legacy = color === 'dark'
    ? (process.env.PRINTFUL_VARIANT_ID_DARK  || process.env.PRINTFUL_VARIANT_ID)
    : (process.env.PRINTFUL_VARIANT_ID_LIGHT || process.env.PRINTFUL_VARIANT_ID);
  return parseInt(perSize || legacy || '0', 10);
}

export function getShippingDetails(session: Stripe.Checkout.Session): PrintfulAddress | null {
  // API 2026+ : l'adresse de livraison est sous collected_information.shipping_details.
  // Fallbacks : ancien champ top-level (API < 2025), puis customer_details
  // (facturation) en dernier recours. Lire directement session.shipping_details
  // renvoyait undefined → on imprimait/expédiait vers l'adresse de facturation.
  type ShipLike = Stripe.Checkout.Session['customer_details'];
  const ci = (session as unknown as { collected_information?: { shipping_details?: ShipLike } }).collected_information;
  const legacy = (session as unknown as { shipping_details?: ShipLike }).shipping_details;
  const shipping = ci?.shipping_details ?? legacy ?? session.customer_details;
  if (!shipping?.address || !shipping.name) return null;
  return {
    name:         shipping.name,
    address1:     shipping.address.line1 ?? '',
    address2:     shipping.address.line2 ?? undefined,
    city:         shipping.address.city ?? '',
    state_code:   shipping.address.state ?? '',
    country_code: shipping.address.country ?? '',
    zip:          shipping.address.postal_code ?? '',
  };
}

export async function fulfillOrder({ orderId, memberId, tshirtColor, tshirtSize }: FulfillmentParams): Promise<FulfillmentResult> {
  const size = coerceSize(tshirtSize);
  // ─── 1. Idempotence : skip si déjà fulfilled ───────────────────────────────
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, stripe_session_id, printful_order_id, status, qr_style, tagline_id, short_code')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) return { ok: false, reason: 'order_not_found' };
  if (order.status !== 'paid') return { ok: false, reason: 'order_not_paid' };
  if (order.printful_order_id) return { ok: true, alreadyFulfilled: true, printfulOrderId: order.printful_order_id };

  // ─── 2. Récupère l'adresse de livraison depuis Stripe ──────────────────────
  if (!order.stripe_session_id) return { ok: false, reason: 'no_stripe_session' };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const shipping = getShippingDetails(session);
  if (!shipping) return { ok: false, reason: 'no_shipping_details' };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { ok: false, reason: 'no_app_url' };

  // ─── 3. Résout le short_code encodé dans le QR + où stocker le fichier ──────
  // Deux chemins :
  //  A. AVEC membre (rachat, ou activation en FULFILL_ON_PAYMENT=false) : le code
  //     vit sur le membre ; on le garantit (H3) et on stocke sous <memberId>/.
  //  B. SANS membre (impression au paiement) : le code est réservé sur la
  //     commande (orders.short_code) ; on stocke sous orders/<orderId>/ et on ne
  //     touche PAS `members` (il n'existe pas encore).
  let shortCode: string | null;
  let filePath: string;
  if (memberId) {
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, short_code')
      .eq('id', memberId)
      .single();

    if (!member) return { ok: false, reason: 'member_not_found' };

    // H3 : garantir un short_code AVANT d'imprimer le QR. Sinon, si la génération
    // a échoué à la création du membre, le QR figerait l'URL longue (/profil/UUID)
    // sur le t-shirt physique → QR plus dense, risque de mauvais scan. On en
    // génère + persiste un à la volée (cohérent avec /r/[code]).
    shortCode = member.short_code as string | null;
    if (!shortCode) {
      try {
        const candidate = await generateUniqueShortCode();
        const { error: scErr } = await supabaseAdmin
          .from('members').update({ short_code: candidate }).eq('id', memberId);
        if (!scErr) shortCode = candidate;
        else console.error('[fulfillment] short_code persist failed:', scErr.message);
      } catch (e) {
        console.error('[fulfillment] short_code generation failed:', e);
      }
    }
    filePath = `${memberId}/qr-${tshirtColor}.svg`;
  } else {
    // Impression au paiement : le code doit être réservé sur la commande. Si absent
    // (réservation ratée au webhook), on en réserve un ici pour ne pas figer une URL
    // longue sur le tee — le futur membre héritera de CE code.
    shortCode = order.short_code as string | null;
    if (!shortCode) {
      try {
        const candidate = await generateUniqueShortCode();
        const { error: scErr } = await supabaseAdmin
          .from('orders').update({ short_code: candidate }).eq('id', orderId).is('short_code', null);
        if (!scErr) shortCode = candidate;
        else console.error('[fulfillment] order short_code persist failed:', scErr.message);
      } catch (e) {
        console.error('[fulfillment] order short_code generation failed:', e);
      }
    }
    if (!shortCode) return { ok: false, reason: 'no_short_code' };
    filePath = orderQrStoragePath(orderId, tshirtColor);
  }

  // Sans membre, on n'a pas de repli /profil/<uuid> → shortCode est garanti ci-dessus.
  const qrDataUrl = shortCode
    ? buildShortUrl(shortCode)
    : `${appUrl}/profil/${memberId}`;

  // ─── 4. Génère + upload le QR SVG premium (forme choisie par le client) ────
  // qr_style est stocké sur l'order au checkout ; fallback défaut si absent
  // (commandes antérieures à la feature). Toutes les formes exposées sont
  // prouvées décodables (test qr-decode).
  const styleKey = (order.qr_style as QrStyleKey) in QR_STYLE_CORNER
    ? (order.qr_style as QrStyleKey) : DEFAULT_QR_STYLE;
  // Dos = QR + accroche (le hameçon). L'accroche est choisie par le client dans une
  // bibliothèque fermée (orders.tagline_id) ; absente/invalide → QR seul. Elle est
  // détourée en vecteur (aucune dépendance police au POD) et placée SOUS la quiet zone.
  const qr = composeBackPrintSVG(qrDataUrl, tshirtColor, {
    moduleCorner: QR_STYLE_CORNER[styleKey],
    taglineId:    (order.tagline_id as string | null | undefined) ?? null,
  });

  // La largeur imprimée est FIXE : plus l'URL est longue, plus les modules sont
  // petits, moins le QR se lit de loin. Sans `SHORT_DOMAIN`, on encode
  // `https://<app>.vercel.app/r/<code>` (37 modules) au lieu de `https://inreal.me/<code>`
  // (29) → la portée tombe de ~2,5 m à ~2,0 m, en silence. On refuse le silence.
  if (qr.modules > NOMINAL_QR_MODULES) {
    const reach = BACK_TARGET_SCAN_M * (NOMINAL_QR_MODULES / qr.modules);
    console.warn(
      `[fulfillment] QR à ${qr.modules} modules (nominal ${NOMINAL_QR_MODULES}) : ` +
      `portée de scan ≈ ${reach.toFixed(1)} m au lieu de ${BACK_TARGET_SCAN_M} m. ` +
      `URL encodée : ${qrDataUrl}. Configurer SHORT_DOMAIN raccourcit l'URL et rend la portée.`,
    );
  }
  const { error: uploadError } = await supabaseAdmin.storage
    .from('qrcodes')
    .upload(filePath, qr.buffer, { contentType: 'image/svg+xml', upsert: true });

  if (uploadError) return { ok: false, reason: `upload_failed: ${uploadError.message}` };

  const { data: { publicUrl } } = supabaseAdmin.storage.from('qrcodes').getPublicUrl(filePath);

  // Le QR digital du membre (dashboard) : uniquement en chemin « avec membre ».
  // Sans membre (impression au paiement), l'activation pointera qr_code_url vers
  // CE fichier (même short_code, même contenu) — cf. api/member/create.
  if (memberId) {
    await supabaseAdmin.from('members').update({ qr_code_url: publicUrl }).eq('id', memberId);
  }

  // ─── 4b. Monogramme )( poitrine — IDENTIQUE pour tous les porteurs ─────────
  // Contrairement au QR (unique par membre), il ne dépend que du thème du tee.
  // Upload en `upsert` sur un chemin fixe → écrit une fois, ré-écrit à l'identique
  // ensuite. Pas de fichier par membre.
  let frontUrl: string | null = null;
  let frontAspect = 1;                            // hauteur/largeur du lockup (pour la zone Printful)
  if (PRINT_FRONT_LOGO) {
    const monogram = generateBrandMonogramSVG(tshirtColor);
    frontAspect = monogram.height / monogram.width;
    const logoPath = `_brand/logo-front-${tshirtColor}.svg`;
    const { error: logoErr } = await supabaseAdmin.storage
      .from('qrcodes')
      .upload(logoPath, monogram.buffer, { contentType: 'image/svg+xml', upsert: true });
    // BLOQUANT volontairement : un tee sans son monogramme = incohérence de marque
    // livrée au client. On échoue, et `cron/fulfillment-reconcile` rejouera.
    if (logoErr) return { ok: false, reason: `front_logo_upload_failed: ${logoErr.message}` };
    frontUrl = supabaseAdmin.storage.from('qrcodes').getPublicUrl(logoPath).data.publicUrl;
  }

  // ─── 5. Création de la commande chez le POD (Printful OU Gelato) ───────────
  // Le fichier dos (QR + accroche) et le monogramme sont déjà uploadés (publicUrl,
  // frontUrl) — provider-agnostic. Seule la création diffère.
  let providerOrderId: string;

  if (FULFILLMENT_PROVIDER === 'gelato') {
    // ── Gelato (alternative EU). productUid par (couleur × taille), fichiers SVG,
    // placements 'back'/'default'. Cf. src/lib/gelato.ts (points à valider). ──
    const buyerEmail = session.customer_details?.email ?? session.customer_email ?? '';
    const g = await createGelatoOrder({
      orderId,
      email:     buyerEmail,
      recipient: shipping,
      color:     tshirtColor,
      size,
      backUrl:   publicUrl,
      frontUrl,
    });
    if (!g.ok) return { ok: false, reason: g.reason };
    providerOrderId = g.providerOrderId ?? '';

  } else {
    // ── Printful (idempotent via external_id) ──
    const variantId = getVariantId(tshirtColor, size);
    if (!variantId) return { ok: false, reason: 'no_printful_variant_id' };

    const colorLabel = tshirtColor === 'dark' ? 'Black' : 'White';

    // Le fichier dos n'est plus carré quand il porte une accroche (QR + texte dessous).
    // On adapte la hauteur de la zone Printful au ratio réel du fichier → le QR garde
    // sa largeur (25 cm ⇒ ~2,5 m) et rien n'est étiré. Sans accroche, ratio = 1 → BACK_POSITION.
    const backAspect  = qr.height / qr.width;
    const backHeight  = Math.round(BACK_POSITION.width * backAspect);
    const backPosition = {
      ...PRINT_AREA,
      width:  BACK_POSITION.width,
      height: backHeight,
      left:   BACK_POSITION.left,
      top:    Math.min(BACK_POSITION.top, PRINT_AREA.area_height - backHeight),
    };

    // Face : lockup )( + nom, PAYSAGE. Hauteur = ratio réel du fichier (pas de carré figé).
    const frontHeight   = Math.round(FRONT_WIDTH_PX * frontAspect);
    const frontPosition = {
      ...PRINT_AREA,
      width:  FRONT_WIDTH_PX,
      height: frontHeight,
      left:   Math.round(FRONT_CENTER_X - FRONT_WIDTH_PX / 2),
      top:    FRONT_TOP,
    };

    const payload: PrintfulOrderPayload & { external_id: string } = {
      external_id: orderId,
      recipient: shipping,
      items: [{
        variant_id: variantId,
        quantity:   1,
        name:       `In Real Society — Stanley/Stella Creator 2.0 ${colorLabel} ${size} (DTF)`,
        files: [
          // Dos : le QR unique du porteur (+ accroche dessous si choisie).
          { type: 'back' as const, url: publicUrl, position: backPosition },
          // Face : le lockup )( + nom (si activé). Deux emplacements = coût Printful supérieur.
          ...(frontUrl ? [{ type: 'front' as const, url: frontUrl, position: frontPosition }] : []),
        ],
      }],
    };

    // Paiement réel : la commande part à l'impression (confirm=true). En test
    // (recette), elle reste en brouillon chez Printful, ni imprimée ni facturée.
    // Sans confirm, TOUTES restaient en brouillon : rien n'était imprimé.
    const confirm = livePayments();
    const res = await fetch(`https://api.printful.com/orders${confirm ? '?confirm=true' : ''}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.PRINTFUL_API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, reason: `printful_${res.status}: ${text.slice(0, 200)}` };
    }

    const printfulData = await res.json() as PrintfulOrderResponse;
    providerOrderId = String(printfulData.result?.id ?? '');
    // Coût calculé en différé : Printful garde la commande en brouillon malgré
    // confirm=true. Sans confirmation à la main, rien n'est imprimé.
    if (confirm && printfulData.result?.status === 'draft') {
      audit({ action: 'order.printful_draft', metadata: { orderId, printfulOrderId: providerOrderId } });
    }
  }

  // ─── 6. Mark fulfilled ─────────────────────────────────────────────────────
  // `printful_order_id` stocke l'id du POD actif (Printful OU Gelato). ⚠️ Le suivi
  // (/commande → getPrintfulTracking) et l'annulation (refund → cancelPrintfulOrder)
  // ciblent encore Printful : les rendre provider-aware AVANT de basculer en prod.
  await supabaseAdmin
    .from('orders')
    .update({ printful_order_id: providerOrderId, fulfilled_at: new Date().toISOString() })
    .eq('id', orderId);

  return { ok: true, printfulOrderId: providerOrderId };
}
