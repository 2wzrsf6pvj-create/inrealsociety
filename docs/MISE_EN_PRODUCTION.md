# Mise en production — la liste de Clément

> Tout ce qui se règle **hors du code** (Vercel, Supabase, Stripe, Printful,
> emails, juridique), dans l'ordre, avec la façon de vérifier chaque point.
> Le détail technique (migrations, dry-run, CSP) est dans
> [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md). État au 22 octobre 2026.

## 0. État des lieux (5 minutes)

- [ ] **Vercel** : un projet est relié au dépôt (chaque PR reçoit une
      préversion). Dans Vercel → *Settings → Git*, vérifier que la branche de
      production est `main` : chaque fusion part alors en production. Noter le
      domaine de production (*Settings → Domains*).
- [ ] Ouvrir `https://<domaine>/api/health` :
  - `"supabase":"ok"` : une base répond ;
  - `"skip"` : aucune base configurée ;
  - `"fail"` : une base est configurée mais ne répond pas.

## 1. Variables d'environnement

Vercel → *Settings → Environment Variables*, environnement **Production**.
Au démarrage, l'application liste dans ses logs les variables recommandées
qui manquent.

**Indispensables : sans elles, le site ou les QR codes ne fonctionnent pas.**

| Variable | Sans elle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | le site ne démarre pas |
| `NEXT_PUBLIC_APP_URL` | liens faux dans les emails et les QR codes |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **scanner un QR code, envoyer un message, signaler : erreur 500** (vérifié en local) |

**Vente.**

| Variable | Sans elle |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | pas de paiement, ou commandes payées non enregistrées |
| `PRINTFUL_API_TOKEN` | t-shirt payé jamais imprimé |
| `PRINTFUL_VARIANT_ID_{DARK,LIGHT}_{S,M,L,XL,XXL}` (10 variables) | toutes les commandes partent dans la taille par défaut |
| `STRIPE_PREMIUM_PRICE_ID` | abonnement premium indisponible |
| `STRIPE_REFERRAL_COUPON_ID` | pas de remise parrainage |

**Emails, alertes, tâches planifiées.**

| Variable | Sans elle |
|---|---|
| `RESEND_API_KEY` | aucun email : code d'activation, notifications, confirmations |
| `ADMIN_ALERT_EMAIL` | personne n'est prévenu d'un message ou d'un profil signalé, ni d'un échec qui touche l'argent (paiement sans commande, code non envoyé, t-shirt non imprimé) |
| `CRON_SECRET` | tâches planifiées non lancées (purge RGPD, relances) ; sans elle ni `INTERNAL_SECRET`, les emails de scan partent sans lien de désinscription |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | erreurs invisibles : les logs Vercel ne durent qu'une heure (Hobby) ou un jour (Pro) |

**Confort.**

| Variable | Sans elle |
|---|---|
| `OPENAI_API_KEY` | modération par règles seules, moins fine |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pas de notifications push |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | pas de mesure d'audience |
| `INTERNAL_SECRET` | newsletter et notifications externes désactivées |
| `EMAIL_FROM` | rien : à ne régler que pour changer d'expéditeur (défaut `In Real Society <noreply@mail.inrealsociety.com>`) |

- [ ] Toutes les variables indispensables et de vente sont renseignées.
- [ ] Vercel → *Cron Jobs* : les 5 tâches de `vercel.json` apparaissent.

## 2. Base Supabase

- [ ] Appliquer les migrations jusqu'à **061**, dans l'ordre
      (`DEPLOY_CHECKLIST.md`, section 1 ; avec la CLI : `docs/SUPABASE_CLI.md`).
- [ ] Vérifier : SQL Editor → `scripts/verify-migrations.sql`, chaque résultat
      conforme à « attendu ».
- [ ] *Auth → Providers → Email* : **« Confirm email » activé**. Sinon,
      n'importe qui peut récupérer le profil d'un autre en s'inscrivant avec
      son email.
- [ ] *Auth → Email templates* et *URL Configuration* : modèles et adresses de
      redirection (`DEPLOY_CHECKLIST.md`, section 2).

## 3. Stripe

- [ ] Price du t-shirt **et** price du premium en **« inclusive »** (TTC) :
      sinon la TVA s'ajoute aux 49 € et aux 2,99 € affichés (3,59 €).
- [ ] **Stripe Tax** activé.
- [ ] Webhook vers `https://<domaine>/api/webhook/stripe`, avec les
      événements `checkout.session.completed`,
      `customer.subscription.updated`, `customer.subscription.deleted`,
      `charge.refunded`, `invoice.payment_failed`.
- [ ] Coupon parrainage plafonné (nombre d'utilisations ou durée) : le lien
      de parrainage circule librement.
- [ ] Portail client : résiliation autorisée **à la fin de la période** (le
      premium reste actif jusqu'à la fin du mois payé, comme l'annoncent les
      CGV) et mise à jour du moyen de paiement autorisée.
- [ ] Faire relire par le juriste l'article 8 des CGV (abonnement premium) et
      l'email de bienvenue premium, qui vaut confirmation du contrat.

L'application envoie elle-même la confirmation de résiliation, avec la date de
fin (Code de la consommation, L215-1-1) : rien à régler dans Stripe.

**Rétractation du premium** (14 jours, remboursée en entier, CGV article 8) :
sur demande à hello@inrealsociety.com, rembourser le paiement dans Stripe puis
annuler l'abonnement immédiatement. Le porteur reçoit l'email de fin du
premium.

## 4. Emails

Détail et vérifications : `docs/EMAIL_DELIVERABILITY.md`.

- [ ] Resend : domaine **`mail.inrealsociety.com`** vérifié (SPF, DKIM), et
      DMARC sur le domaine principal (sections 1 et 2). Sans eux, les emails
      arrivent en spam ou pas du tout.
- [ ] Resend : offre **Pro** au lancement. L'offre gratuite plafonne à 100
      emails par jour : au-delà, plus rien ne part, codes d'activation compris.
- [ ] Resend : suivi des ouvertures et des clics désactivé.
- [ ] (Supabase) SMTP personnalisé avec Resend (section 4) : sans lui, la
      confirmation d'inscription et le mot de passe oublié ne partent pas.
- [ ] Google Postmaster Tools : ajouter `inrealsociety.com`, pour voir les
      plaintes de Gmail (qui ne les transmet pas à Resend).
- [ ] S'envoyer un email de test, par exemple « Code perdu ? Renvoyer
      l'email » sur la page d'activation (`/register`), après une commande de
      test. Puis un passage sur mail-tester.com : 9/10 visé.

## 5. Surveillance

Détail : `docs/MONITORING.md`.

- [ ] Sentry : une règle d'alerte sur le tag `alerte` = `argent`, en
      `production`, qui prévient à chaque occurrence (section 3).
- [ ] Sentry → *Crons* : après le premier passage de `fulfillment-reconcile`
      (5 h UTC), le moniteur apparaît ; vérifier qu'il prévient en cas d'oubli
      ou d'échec.
- [ ] Moniteur de disponibilité gratuit (UptimeRobot, Better Stack) sur
      `/api/health`.
- [ ] Printful : notifications du compte activées (commande en attente,
      échec de paiement).

## 6. Juridique (avant la première vente)

- [ ] **Mentions légales et politique de confidentialité** : forme juridique,
      siège, SIRET/RCS, TVA, téléphone, directeur de publication (les
      `[À COMPLÉTER]` de `src/app/mentions-legales` et `src/app/confidentialite`).
- [ ] **Médiateur de la consommation** : obligatoire pour vendre aux
      particuliers ; en choisir un et le nommer dans les mentions légales.
- [ ] **Relecture par un juriste** :
  - l'exclusion du droit de rétractation au motif du QR code unique : risquée.
    Si elle tombe, le client a 14 jours, et jusqu'à 12 mois faute
    d'information correcte ;
  - la clause de livraison « délais indicatifs, sans engagement » : en vente
    aux particuliers, le vendeur doit s'engager sur une date (L216-1 :
    30 jours à défaut) ;
  - le reste des CGV (âge, modération) et la politique de confidentialité,
    dont les transferts hors UE (Vercel, Sentry, OpenStreetMap).

## 7. Recette : un parcours complet avant d'ouvrir

En mode test Stripe (carte `4242 4242 4242 4242`) :

- [ ] Commander un t-shirt : l'email avec le code d'activation arrive.
- [ ] Activer le profil avec ce code (case 18 ans comprise).
- [ ] Scanner le QR code avec un autre téléphone : le profil s'ouvre.
- [ ] Envoyer un message avec un email : le lien de confirmation arrive.
      Cliquer, puis répondre depuis le tableau de bord : la réponse arrive par
      email et dans la conversation.
- [ ] Signaler ce message : une alerte arrive à `ADMIN_ALERT_EMAIL`. Même chose
      avec « Signaler ce profil ».
- [ ] Rembourser la commande dans Stripe : le profil est suspendu.
