# Économie unitaire

> Ce que rapportent un t-shirt et un abonnement premium, ce que coûte le site
> chaque mois, et combien de ventes couvrent ces frais. Les coûts Printful sont
> des estimations publiques : les remplacer par ceux du compte (section 1), puis
> refaire les calculs. État au 24 octobre 2026.

## Choix de lancement (Clément, octobre 2026)

| Choix | Pourquoi | Réglage |
|---|---|---|
| Franchise en base de TVA (art. 293 B du CGI) | statut choisi : aucune TVA facturée | `VAT_EXEMPT` |
| Livraison standard seulement | l'express (12 €) partait quand même en standard chez Printful : la commande ne précisait pas la méthode | option unique dans `api/shop/checkout` |
| Livraison offerte, 49 € en tout | un prix rond, sans frais ajoutés au paiement ; le port est pris sur la marge | `SHIPPING_STANDARD_CENTS` (0) |
| Logo poitrine gardé | choix de marque, à revoir avec les vraies factures Printful | `PRINT_FRONT_LOGO` |
| France métropolitaine, Belgique, Luxembourg, Allemagne | hors UE : port forfaitaire insuffisant, droits et TVA à payer par le client à la livraison, TVA britannique due dès la première vente | `SHIPPING_COUNTRIES` |

Les réglages sont dans `src/lib/constants.ts`. Les montants débités viennent
des Prices Stripe (`STRIPE_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`) : les garder
égaux aux prix affichés (`TSHIRT_PRICE_EUR`, `PREMIUM_PRICE_LABEL`).

## 1. Hypothèses, à remplacer par les vrais chiffres

| Poste | Valeur retenue | Où la vérifier |
|---|---|---|
| Stripe, carte européenne standard | 1,5 % + 0,25 € par paiement | tarifs Stripe (cartes premium ou hors UE : plus cher) |
| Stripe Billing (abonnements) | 0,7 % du montant | tarifs Stripe |
| Printful : t-shirt imprimé au dos | ≈ 13 € HT | catalogue Printful, avec le vrai fichier d'impression |
| Printful : logo poitrine (2e emplacement) | ≈ 4,50 € HT | idem |
| Printful : port vers la France | 4,79 € HT | calculateur de livraison Printful |
| TVA sur les factures Printful | ≈ 20 % (taux du pays livré) | une vraie facture Printful |

Le plus sûr : passer une commande test et lire la facture Printful.

## 2. Marge par t-shirt

France, livraison offerte, sans remise de parrainage :

| | Montant |
|---|---|
| Payé par le client (49 €, livraison offerte) | 49,00 € |
| Stripe (1,5 % × 49 € + 0,25 €) | −0,99 € |
| Printful, TVA comprise ((13 + 4,50 + 4,79) × 1,2) | −26,75 € |
| **Marge** | **≈ 21 €** |

En franchise, la TVA payée à Printful n'est pas récupérable : elle fait partie
du coût. Avec 5 € de port facturés en plus, la marge serait d'environ 26 €.

Non compté : la remise de parrainage (elle se déduit telle quelle), un
t-shirt remboursé après impression (perdu), le coût d'acquisition des clients.

## 3. Marge par abonné premium

| | Par mois |
|---|---|
| Payé par l'abonné | 2,99 € |
| Stripe (1,5 % × 2,99 € + 0,25 €) | −0,29 € |
| Stripe Billing (0,7 %) | −0,02 € |
| **Reste** | **≈ 2,67 €** |

Les 0,25 € fixes, prélevés à chaque mensualité, pèsent 8 % du prix.

## 4. Frais fixes par mois

| Service | Offre | Prix | Pourquoi pas l'offre gratuite |
|---|---|---|---|
| Vercel | Pro | 20 $ | réservée à un usage non commercial |
| Supabase | Pro | 25 $ | projet mis en pause après une semaine sans activité |
| Resend | Pro | 20 $ | 100 emails par jour au plus, codes d'activation compris |
| **Total** | | **65 $, ≈ 60 €** | |

Gratuits au lancement : Upstash (limites de débit), Sentry, PostHog, la
modération OpenAI. Surveiller leurs plafonds mensuels.

Non compté : nom de domaine, comptable, assurance, médiateur de la
consommation (obligatoire, souvent payant).

## 5. Seuil de rentabilité

Frais fixes ÷ marge par t-shirt = 60 € ÷ 21 € ≈ 2,9 : **3 t-shirts par mois**
couvrent les frais fixes.

Le premium y contribue aussi : 23 abonnés couvrent à eux seuls les frais fixes,
et 2 t-shirts plus 7 abonnés suffisent (42 € + 19 €).

## 6. Leviers (aucun n'est appliqué)

- **Logo poitrine** : ≈ 5,40 € TVA comprise par t-shirt, un quart de la
  marge. C'est un choix de marque, gardé au lancement.
- **Port** : offert, il coûte ≈ 5,75 € (4,79 € plus la TVA),
  pris sur la marge. Facturé 5 € à part, il rendrait ≈ 5 € par t-shirt, mais
  le client paierait 54 €.
- **Premium annuel**, par exemple à 29 € :
  - 12 mensualités : 35,88 € payés, 3,79 € de frais, 32,09 € nets ;
  - 29 € en une fois : 0,89 € de frais, 28,11 € nets, encaissés d'avance ;
  - l'annuel rapporte plus tant qu'un abonné mensuel reste en moyenne moins
    de 10,5 mois.
- **Coupon de parrainage plafonné** (nombre d'utilisations ou durée) : chaque
  utilisation se déduit de la marge du t-shirt.

## 7. Ce qu'implique la franchise de TVA

- Aucune TVA facturée. La mention « TVA non applicable, art. 293 B du CGI »
  figure dans les CGV et les mentions légales. Elle doit aussi figurer sur les
  factures, donc dans le pied de facture Stripe (`MISE_EN_PRODUCTION.md`,
  section 3).
- **À faire confirmer par un comptable** : en franchise, les services achetés
  à des entreprises étrangères (Vercel, Supabase, Resend, publicité en ligne)
  restent en principe soumis à la TVA française. L'acheteur la déclare et la
  paie lui-même (autoliquidation), sans pouvoir la récupérer, avec un numéro de
  TVA intracommunautaire, qui figure alors dans les mentions légales. Dans ce
  cas, les frais fixes passent d'environ 60 € à environ 72 € par mois. Le seuil
  reste à 3 t-shirts.

## 8. Seuils à surveiller

- **Franchise en base**, sur le chiffre d'affaires annuel (valeurs 2026,
  inchangées depuis 2025) :
  - l'activité est mixte (t-shirts : vente de biens ; premium : service) ;
  - le total doit rester sous 85 000 € et le premium seul sous 37 500 € ;
  - au-delà des seuils majorés (93 500 € et 41 250 €), la TVA est due dès le
    dépassement ;
  - entre les deux seuils, elle est due à partir du 1er janvier suivant ;
  - à revérifier chaque année sur impots.gouv.fr.
- **10 000 € de ventes à des particuliers d'autres pays de l'UE**, sur l'année
  en cours ou la précédente : t-shirts livrés en Belgique, au Luxembourg ou en
  Allemagne, et premium de leurs habitants. Au-delà, ces ventes prennent la TVA
  du pays du client, même en franchise. Elle se déclare par le guichet unique
  (OSS). À préparer avec un comptable avant d'approcher le seuil.

## 9. Si l'entreprise devient assujettie à la TVA

1. Passer `VAT_EXEMPT` à `false` (`src/lib/constants.ts`). Les CGV et les
   emails affichent alors « TTC », et les mentions légales réclament le numéro
   de TVA. Stripe calcule la TVA et demande l'adresse de facturation du
   premium.
2. Stripe : activer Stripe Tax et déclarer les enregistrements (France, et OSS
   au besoin).
3. Les Prices du t-shirt et du premium doivent être en tax_behavior
   « inclusive », pour garder 49 € et 2,99 €. C'est déjà demandé dans
   `MISE_EN_PRODUCTION.md`, car ce réglage ne change plus une fois choisi.
4. Mentions légales : ajouter le numéro de TVA intracommunautaire. Stripe :
   retirer la mention 293 B du pied de facture.
5. Les abonnements premium en cours ne passent pas seuls à la TVA : les mettre
   à jour dans Stripe.
6. Marge : ≈ 17 € par t-shirt au lieu de 21 €, ≈ 2,16 € par abonné et par
   mois au lieu de 2,67 €.

Sources, consultées en octobre 2026 (estimations à revérifier) :
[Printful, fiche du t-shirt](https://www.printful.com/custom/mens/shirts/unisex-organic-cotton-t-shirt-stanley-stella-sttu169),
[Printful, tarifs](https://www.printful.com/pricing),
[Printful, API (livraison standard par défaut)](https://developers.printful.com/docs/),
[port Printful vers l'Europe](https://podvector.ai/articles/printful/costs-and-charges/printful-shipping-prices-full-breakdown-for-pod-sellers),
[frais Stripe en France](https://hayot-expertise.fr/en/blog/stripe-vs-adyen-vs-mollie-ecommerce-payments-france-2026),
[Stripe Tax](https://support.stripe.com/questions/understanding-stripe-tax-pay-as-you-go-pricing),
[coût de Vercel](https://makerkit.dev/blog/saas/vercel-cost),
[tarifs Supabase](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/),
[TVA britannique sous 135 £](https://landmarkglobal.com/eu/en/news-insights/uk-vat-on-low-value-goods-the-135-threshold-rule/),
[seuils de franchise 2026](https://www.superindep.fr/blog/2024/nouveautes-tva-2025/),
[autoliquidation en franchise](https://lefreelance.fr/articles/autoliquidation-tva-logiciels-etrangers/),
[seuil européen de 10 000 €](https://www.superindep.fr/blog/2026/tva-ecommerce-autoentrepreneur/).
