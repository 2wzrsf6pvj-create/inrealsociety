# Mise en production — la liste de Clément

> Tout ce qui se règle **hors du code** (Vercel, Supabase, Stripe, Printful,
> emails, juridique), dans l'ordre, avec la façon de vérifier chaque point.
> Le détail technique (migrations, dry-run, CSP) est dans
> [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md). Marges, frais fixes et seuils
> de TVA : [`ECONOMIE_UNITAIRE.md`](./ECONOMIE_UNITAIRE.md). État au 24 octobre 2026.

## Chemin vers J0 (le test terrain)

Au 24 octobre 2026, rien n'est encore en place. Voici l'ordre : d'abord ce
qui demande le plus de délai, puis les réglages, chaque étape renvoyant à sa
section. `/admin` →
« Configuration » montre ce que l'app voit déjà : variables présentes ou
manquantes, paiements réels ou de test, domaines encodés dans les QR.

Pour tout tester soi-même dès maintenant, en mode test et gratuitement, sans
statut ni domaine : [TESTER_DE_A_A_Z.md](TESTER_DE_A_A_Z.md). Ce sont les
étapes 5 à 9 ci-dessous, faites plus tôt.

1. **Statut et SIRET**, si ce n'est pas fait (quelques jours à deux
   semaines) : Stripe en paiement réel, les mentions légales et le médiateur
   le demandent.
2. **Juridique, à lancer tout de suite** (plusieurs semaines) : médiateur,
   juriste, comptable (section 6). Prêt avant la première vente réelle.
3. **Domaines** (une heure) : le domaine définitif, l'ajouter au projet
   Vercel, le mettre dans `NEXT_PUBLIC_APP_URL` ; puis **`inreal.me`**, ajouté
   au **même** projet Vercel **sans redirection** vers le domaine principal,
   et `SHORT_DOMAIN=https://inreal.me` (sections 0 et 1). Les QR imprimés
   encodent `inreal.me/<code>` pour toujours : aucune impression avant que
   `/admin` → « Configuration » n'affiche les deux domaines sans point à
   régler.
4. **Offres payantes** (une heure) : Vercel Pro, Supabase Pro, Resend Pro
   (sections 0, 2 et 4).
5. **Base** (une heure) : migrations jusqu'à 063, vérification, réglages de
   l'authentification (section 2).
6. **Emails** (une heure, puis jusqu'à 48 h de propagation DNS) : domaine
   d'envoi vérifié chez Resend, puis **l'envoi des emails de Supabase par
   Resend**. Sans lui, Supabase n'écrit qu'aux membres de l'équipe du
   projet, 2 emails par heure : les testeurs ne pourraient pas confirmer leur
   compte (section 4).
7. **Variables** (une heure) : indispensables, vente, emails et alertes, et
   les **clés de notifications**, indispensables pour le test (section 1).
   Comptes gratuits à créer : Upstash, Sentry.
8. **Stripe en mode test et Printful** (une heure) : prix, webhook, portail ;
   carte de paiement enregistrée chez Printful, les 10 variantes (section 3).
9. **Recette** en paiement de test (section 7). Les commandes restent en
   brouillon chez Printful : rien n'est imprimé ni facturé.
10. **Surveillance** (30 minutes) : alertes Sentry, moniteur de
    disponibilité, notifications Printful, Dependabot (section 5).
11. **Paiement réel** (30 minutes) : clés, webhook et prix Stripe en mode
    réel. Une commande payée part alors à l'impression d'elle-même. `/admin`
    → « Configuration » : « Paiements : réels », rien à régler.
12. **J-14** : les 10 commandes du test (`TEST_TERRAIN.md`, section 3).
13. **J0** : remise des t-shirts, et le premium offert à chaque testeur
    depuis `/admin` (`TEST_TERRAIN.md`, section 3).

Compter deux à trois semaines (statut, juridique, DNS, impression et
livraison), dont une journée de réglages.

## 0. État des lieux (5 minutes)

- [ ] **Vercel** : un projet est relié au dépôt (chaque PR reçoit une
      préversion). Dans Vercel → *Settings → Git*, vérifier que la branche de
      production est `main` : chaque fusion part alors en production. Noter le
      domaine de production (*Settings → Domains*).
- [ ] Vercel → *Settings → Domains* : **`inreal.me`** ajouté au même projet,
      rattaché à la production, **sans** redirection vers le domaine
      principal (ne pas choisir « Redirect to… »). Chez le registraire
      d'`inreal.me` : les enregistrements DNS que Vercel indique. L'app envoie
      elle-même `inreal.me/<code>` vers le profil, et le reste vers le site.
- [ ] Vercel : offre **Pro** (20 $/mois) avant la première vente. L'offre
      gratuite (Hobby) est réservée à un usage non commercial.
- [ ] Ouvrir `https://<domaine>/api/health` :
  - `"supabase":"ok"` : une base répond ;
  - `"skip"` : aucune base configurée ;
  - `"fail"` : une base est configurée mais ne répond pas.

## 1. Variables d'environnement

Vercel → *Settings → Environment Variables*, environnement **Production**.
Une variable ajoutée ou modifiée ne compte qu'au déploiement suivant :
*Deployments* → dernier déploiement → *Redeploy*. Au démarrage, l'application
liste dans ses logs les variables recommandées qui manquent.

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
| `ADMIN_EMAILS` | pas d'accès à `/admin` (modération, chiffres et suivi du test, premium offert, commandes, configuration) : emails autorisés, séparés par des virgules |
| `ADMIN_ALERT_EMAIL` | personne n'est prévenu d'un message ou d'un profil signalé, ni d'un échec qui touche l'argent (paiement sans commande, code non envoyé, t-shirt non imprimé) |
| `CRON_SECRET` | tâches planifiées non lancées (purge RGPD, relances, premium et fin du premium offert, rattrapage d'impression) ; sans elle ni `INTERNAL_SECRET`, les emails de scan partent sans lien de désinscription |
| `INTERNAL_SECRET` | liens signés des emails ; newsletter et notifications externes désactivées |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | erreurs invisibles : les logs Vercel ne durent qu'une heure (Hobby) ou un jour (Pro) |

**Indispensables pour le test terrain.**

| Variable | Sans elle |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | aucune notification : un message n'est vu qu'en ouvrant le site. Les générer avec `npx web-push generate-vapid-keys` ; la clé publique va dans les deux variables `…PUBLIC_KEY` |
| `SHORT_DOMAIN` | les QR encodent le domaine principal (`<site>/r/<code>`) : plus longs, ils se lisent de moins loin (≈ 2,0 m au lieu de 2,5 m). Valeur : `https://inreal.me`, une fois ce domaine ajouté au projet Vercel sans redirection. Avec une redirection Vercel vers le domaine principal, chaque QR imprimé mènerait à une page introuvable |

**Confort.**

| Variable | Sans elle |
|---|---|
| `OPENAI_API_KEY` | modération par règles seules, moins fine |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | pas de mesure d'audience |
| `EMAIL_FROM` | rien : à ne régler que pour changer d'expéditeur (défaut `In Real Society <noreply@mail.inrealsociety.com>`) |
| `VAPID_SUBJECT` | rien : contact transmis aux services de notifications (défaut `mailto:hello@inrealsociety.com`) |

- [ ] Toutes les variables indispensables et de vente sont renseignées.
- [ ] Vercel → *Cron Jobs* : les 5 tâches de `vercel.json` apparaissent.

## 2. Base Supabase

- [ ] Offre **Pro** (25 $/mois) avant l'ouverture : l'offre gratuite met le
      projet en pause après une semaine sans activité.
- [ ] Appliquer les migrations jusqu'à **063**, dans l'ordre
      (`DEPLOY_CHECKLIST.md`, section 1 ; avec la CLI : `docs/SUPABASE_CLI.md`).
- [ ] Vérifier : SQL Editor → `scripts/verify-migrations.sql`, chaque résultat
      conforme à « attendu ».
- [ ] *Auth → Providers → Email* : **« Confirm email » activé**. Sinon,
      n'importe qui peut récupérer le profil d'un autre en s'inscrivant avec
      son email.
- [ ] *Authentication → Email Templates* : remplacer deux modèles par les
      nôtres, en français, dont le lien marche dans n'importe quel navigateur,
      y compris celui de l'app Gmail :
  - « Confirm signup » : sujet « Confirmez votre adresse email », contenu
    `supabase/templates/confirmation.html` ;
  - « Reset Password » : sujet « Réinitialisez votre mot de passe », contenu
    `supabase/templates/recovery.html`.

  Sans eux, les emails partent en anglais, et une confirmation ouverte hors
  du navigateur de l'inscription affiche une erreur alors que l'adresse est
  confirmée.
- [ ] *Authentication → URL Configuration* : *Site URL* = l'adresse du site,
      sans « / » final (les modèles s'en servent) ; *Redirect URLs* : cette
      adresse suivie de `/auth/callback`, puis de `/auth/confirm`
      (`DEPLOY_CHECKLIST.md`, section 2).

## 3. Stripe et Printful

- [ ] Franchise de TVA : **pas de Stripe Tax**, le code ne le demande pas
      (`VAT_EXEMPT`). Dans les réglages des factures, pied de page par défaut :
      « TVA non applicable, art. 293 B du CGI ». La mention est obligatoire sur
      les factures, dont celles du premium.
- [ ] Price du t-shirt (49 €) **et** price du premium (2,99 €/mois) en
      **« inclusive »**. Sans effet en franchise, mais ce réglage ne change plus
      une fois choisi : sans lui, le jour où la TVA s'applique, elle s'ajoute
      aux prix affichés (3,59 € au lieu de 2,99 €).
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

**Printful.**
- [ ] Carte de paiement enregistrée (*Billing*). En paiement réel, chaque
      commande payée est confirmée chez Printful, qui débite l'impression et
      la livraison. En paiement de test, elle reste en brouillon : rien n'est
      imprimé ni facturé.
- [ ] Les 10 variantes (couleur et taille) dans les variables
      `PRINTFUL_VARIANT_ID_*` (section 1) ; `/admin` → « Configuration » les
      compte.
- [ ] Une commande restée en brouillon malgré un paiement réel (coût calculé
      en différé chez Printful) déclenche une alerte : la confirmer à la main
      dans Printful → *Orders*.

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
- [ ] **Bloquant pour J0** : (Supabase) SMTP personnalisé avec Resend
      (section 4). Sans lui, Supabase n'envoie qu'aux membres de l'équipe du
      projet, 2 emails par heure : la confirmation d'inscription et le mot de
      passe oublié ne partent pas aux porteurs.
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
- [ ] Modération : lire `docs/MODERATION.md` (délais, gestes, modèles
      d'email, autorités). `ADMIN_ALERT_EMAIL` sur une boîte lue chaque jour,
      notifications activées sur le téléphone. Accès à `/admin` :
      `docs/MODERATION.md`, section 7. La page sert aussi au quotidien :
      recherche d'un porteur ou d'une commande (renvoi du code d'activation),
      chiffres du test terrain (aussi semaine par semaine), suivi des
      porteurs récents, avis, commandes payées mais pas imprimées, codes non
      utilisés après 7 jours. Déroulé du test terrain :
      [`TEST_TERRAIN.md`](TEST_TERRAIN.md).
- [ ] Printful : notifications du compte activées (commande en attente,
      échec de paiement).
- [ ] GitHub → Settings → Advanced Security (ou Code security) : activer les
      *Dependabot alerts*. Un email arrive quand une faille connue touche un
      paquet du projet.

## 6. Juridique (avant la première vente)

- [ ] **Mentions légales et politique de confidentialité** : forme juridique,
      siège, SIRET/RCS, téléphone, directeur de publication (les
      `[À COMPLÉTER]` de `src/app/mentions-legales` et `src/app/confidentialite`).
- [ ] **Comptable** : faire confirmer le régime de TVA, en particulier
      l'autoliquidation sur les services achetés à l'étranger et les seuils
      (`ECONOMIE_UNITAIRE.md`, sections 7 et 8).
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
    dont les transferts hors UE (Vercel, Sentry, OpenStreetMap) ;
  - l'origine d'un achat (063) : le porteur dont le profil a mené à la
    commande, noté dessus (24 mois), et le lien gardé 30 jours sur l'appareil
    du visiteur sans demander son consentement, au titre du suivi du service
    (`src/lib/scan-origin.ts`). À confirmer, ou à passer sous le bandeau des
    cookies ; même question pour le parrainage.

## 7. Recette : un parcours complet avant d'ouvrir

En mode test Stripe (carte `4242 4242 4242 4242`). Les commandes de la
recette restent en brouillon chez Printful : rien n'est imprimé ni facturé.
Pas à pas, réglages compris : [TESTER_DE_A_A_Z.md](TESTER_DE_A_A_Z.md).
Pour scanner un QR sans t-shirt imprimé : `/admin` → recherche → « Voir le
QR ».
Pour vérifier une impression réelle, confirmer un brouillon à la main dans
Printful (il est alors facturé).

- [ ] Commander un t-shirt : le paiement ne propose que la livraison standard
      (5 €) vers la France, la Belgique, le Luxembourg et l'Allemagne, et
      l'email avec le code d'activation arrive.
- [ ] Activer le profil avec ce code (case 18 ans comprise).
- [ ] Scanner le QR code avec un autre téléphone : le profil s'ouvre.
- [ ] Domaine court : sur un téléphone, ouvrir `inreal.me/<code>` (le code
      du QR : `/admin` → recherche du porteur, ligne « État ») : le profil
      s'ouvre. `inreal.me` seul mène à l'accueil du site.
- [ ] Envoyer un message avec un email : le lien de confirmation arrive.
      Cliquer, puis répondre depuis le tableau de bord : la réponse arrive par
      email et dans la conversation.
- [ ] Signaler ce message : une alerte arrive à `ADMIN_ALERT_EMAIL`. Même chose
      avec « Signaler ce profil ».
- [ ] Rembourser la commande dans Stripe : le profil est suspendu.
- [ ] Réseau coupé, sur un téléphone : ouvrir la page message d'un profil,
      taper un texte, passer en mode avion, appuyer sur « Envoyer » : la page
      dit « Pas de réseau pour le moment… Votre message est gardé. » et le
      texte reste. Réactiver le réseau, « Envoyer » : « Signal envoyé. »
- [ ] Écouter le parcours du passant au lecteur d'écran (VoiceOver ou
      TalkBack), 10 minutes : [ESSAI_LECTEUR_ECRAN.md](ESSAI_LECTEUR_ECRAN.md).
