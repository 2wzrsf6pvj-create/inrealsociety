// src/lib/payments-mode.ts — Paiements réels ou de test, d'après la clé Stripe
// (choix de Clément) : en paiement réel, une commande payée part à
// l'impression ; en test (recette), elle reste en brouillon chez l'imprimeur,
// ni imprimée ni facturée. SERVEUR UNIQUEMENT.

/** Clé Stripe réelle : sk_live_, ou clé restreinte rk_live_. */
export function livePayments(): boolean {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? '');
}
