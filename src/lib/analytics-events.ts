// Liste centralisée des events PostHog. Garde les noms strictement typés
// pour qu'on ne pollue jamais le projet PostHog avec des typos.

export type AnalyticsEvent =
  // Acquisition (côté scanner)
  | 'profile_viewed'
  | 'tee_demo_scanned'          // arrivée sur l'accueil via ?src=tee (scan du tee démo/héros)
  | 'scan_submitted'
  | 'message_submitted'
  | 'message_blocked_conversation_limit'
  | 'message_blocked_window_expired'
  | 'message_blocked_paused'
  | 'message_blocked_already_messaged'
  | 'message_blocked_banned'          // appareil banni (signalements ou équipe)
  // Activation (côté membre)
  | 'member_dashboard_viewed'
  // Funnel ACHAT → ACTIVATION (client, même distinct_id anonyme de /shop à
  // /register, puis identify au member_created). Mesure la déperdition « payé mais
  // jamais de profil » (→ t-shirt jamais fabriqué, le fulfillment attend l'inscription).
  | 'shop_sticky_cta_clicked'   // barre d'achat mobile → amène au formulaire de commande
  | 'checkout_started'          // CTA payer → redirection Stripe
  | 'purchase_success_viewed'   // retour sur /shop/success (paiement OK)
  | 'activation_code_revealed'  // code affiché sur la page succès
  | 'register_viewed'           // ouverture de /register
  | 'account_created'           // compte auth créé (signup)
  | 'member_created'            // profil créé → fulfillment déclenché
  // Conversion premium
  | 'upgrade_cta_viewed'
  | 'upgrade_clicked'
  | 'subscription_active'
  | 'subscription_cancelled'
  // Boucle virale (scanner → porteur) : le scanneur est le lead le plus chaud,
  // on mesure s'il bascule vers la boutique depuis le flow message.
  | 'wearer_cta_viewed'
  | 'wearer_cta_clicked'
  // Activation / cold-start : engager le porteur entre l'achat et son 1er scan.
  | 'activation_guide_viewed'
  | 'activation_preview_viewed'
  // Rétention (P0) : signaux SERVEUR keyés sur le MEMBRE (distinctId = member_id),
  // pour construire la vraie courbe de rétention porteur dans PostHog (« est-il
  // encore scanné / sollicité N semaines après ? »). scan_submitted/message_submitted
  // ci-dessus sont côté SCANNER (acquisition) → ne mesurent pas le retour du porteur.
  | 'member_scanned'           // le porteur a reçu un scan (rencontre réelle)
  | 'member_signal_received';  // le porteur a reçu un message non modéré

export interface AnalyticsProperties {
  member_id?:    string;
  plan?:         'free' | 'premium';
  scan_count?:   number;
  source?:       string;
  reason?:       string;
  [key: string]: unknown;
}
