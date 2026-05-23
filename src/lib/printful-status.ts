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
