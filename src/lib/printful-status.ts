// src/lib/printful-status.ts
// Récupère le statut + le suivi d'expédition d'une commande Printful (GET
// /orders/{id}). SERVEUR UNIQUEMENT (utilise PRINTFUL_API_TOKEN). On ne stocke
// pas le suivi en base (pas de webhook Printful) : on le lit à la volée quand
// l'utilisateur consulte sa commande. Échoue en douceur (null) sans token /
// réseau KO → la page retombe sur la timeline issue de la BDD.

interface PrintfulShipmentRaw {
  carrier?:         string;
  service?:         string;
  tracking_number?: string;
  tracking_url?:    string;
  ship_date?:       string;
}

interface PrintfulOrderStatusResponse {
  result?: {
    status?:    string;
    shipments?: PrintfulShipmentRaw[];
  };
}

export interface OrderShipment {
  carrier:        string | null;
  trackingNumber: string | null;
  trackingUrl:    string | null;
  shipDate:       string | null;
}

export interface OrderTracking {
  printfulStatus: string;        // draft | pending | inprocess | fulfilled | canceled…
  shipments:      OrderShipment[];
}

// Statuts Printful pour lesquels une annulation n'a plus de sens : la commande
// est partie en production / expédiée / déjà annulée. Tenter un DELETE dessus
// échoue (ou est sans effet). On ne tente l'annulation que sur les statuts en
// amont de la prod (draft / pending / onhold / failed).
const CANCELLABLE = new Set(['draft', 'pending', 'onhold', 'failed']);

export interface CancelResult {
  canceled: boolean;
  reason?:  string;     // pourquoi on n'a PAS annulé (statut non annulable, erreur API…)
  status?:  string;     // statut Printful constaté
}

/**
 * Annule une commande Printful si elle n'est pas encore partie en production.
 * SERVEUR UNIQUEMENT. Idempotent et fail-soft : ne throw jamais — renvoie un
 * CancelResult exploitable pour l'audit. Si déjà en prod/expédiée, ne tente RIEN
 * (canceled:false + reason) plutôt que de provoquer une erreur Printful.
 */
export async function cancelPrintfulOrder(printfulOrderId: string): Promise<CancelResult> {
  const token = process.env.PRINTFUL_API_TOKEN;
  if (!token || !printfulOrderId) return { canceled: false, reason: 'no_token_or_id' };

  // 1. Lit le statut réel d'abord : on n'annule que ce qui est encore annulable.
  const tracking = await getPrintfulTracking(printfulOrderId);
  const status = tracking?.printfulStatus ?? 'unknown';
  if (status === 'canceled') return { canceled: true, status }; // déjà annulé → idempotent
  if (!CANCELLABLE.has(status)) {
    return { canceled: false, reason: 'not_cancellable', status };
  }

  // 2. DELETE /orders/{id} — annule la commande côté Printful.
  try {
    const res = await fetch(`https://api.printful.com/orders/${encodeURIComponent(printfulOrderId)}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache:   'no-store',
      signal:  AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { canceled: false, reason: `printful_${res.status}: ${text.slice(0, 150)}`, status };
    }
    return { canceled: true, status };
  } catch (e) {
    return { canceled: false, reason: e instanceof Error ? e.message : 'fetch_failed', status };
  }
}

export async function getPrintfulTracking(printfulOrderId: string): Promise<OrderTracking | null> {
  const token = process.env.PRINTFUL_API_TOKEN;
  if (!token || !printfulOrderId) return null;

  try {
    const res = await fetch(`https://api.printful.com/orders/${encodeURIComponent(printfulOrderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache:   'no-store',
      // Timeout : un Printful lent ne doit pas faire traîner la requête de suivi.
      // L'abort tombe dans le catch → on retombe sur la timeline BDD.
      signal:  AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    const data = await res.json() as PrintfulOrderStatusResponse;
    const r = data.result;
    if (!r) return null;

    return {
      printfulStatus: r.status ?? 'unknown',
      shipments: (r.shipments ?? []).map(s => ({
        carrier:        s.carrier ?? s.service ?? null,
        trackingNumber: s.tracking_number ?? null,
        trackingUrl:    s.tracking_url ?? null,
        shipDate:       s.ship_date ?? null,
      })),
    };
  } catch {
    return null;
  }
}
