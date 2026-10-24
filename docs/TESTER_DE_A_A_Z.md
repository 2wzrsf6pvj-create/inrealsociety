# Tester de A à Z, en mode test et gratuitement

> Pour que Clément teste lui-même tout le parcours (achat, activation, scan,
> messages, modération, premium, remboursement), avec un ordinateur et un
> téléphone, sans statut, sans domaine et sans rien payer : Stripe en mode
> test, offres gratuites partout.
>
> Ce n'est pas jetable : ce sont les étapes 5 à 9 du « Chemin vers J0 »
> (`MISE_EN_PRODUCTION.md`), faites plus tôt, sur le vrai projet. Compter
> 1 h 30 de réglages, puis 30 minutes de parcours.

## 1. Les comptes, tous gratuits

| Service | Pour quoi | Offre |
|---|---|---|
| Supabase | la base, les comptes | gratuite |
| Upstash | les limites de débit : sans lui, scanner et écrire échouent | gratuite |
| Stripe | les paiements, en mode test | gratuit |
| Resend | les emails | gratuite |
| Vercel | le site, déjà relié au dépôt | Hobby, suffisant pour tester |

Facultatifs pour ce test :
- **Printful** : sans lui, une alerte « T-shirt payé non transmis à Printful »
  arrive à chaque commande. C'est normal en test.
- **Clés de notifications** : seulement pour tester les notifications.
- **Sentry**.

## 2. Supabase (20 minutes)

- [ ] Nouveau projet, région UE (Paris ou Francfort). Garder le mot de passe
      de la base.
- [ ] *SQL Editor* : coller tout `scripts/fresh-setup.sql`, puis *Run*.
      Ensuite `scripts/verify-migrations.sql` : chaque résultat conforme à
      « attendu ».
- [ ] *Authentication → Providers → Email* : « Confirm email » activé. C'est
      le réglage par défaut : ne jamais le désactiver.
- [ ] *Authentication → URL Configuration* :
  - *Site URL* : l'adresse du site (étape 6) ;
  - *Redirect URLs* : cette adresse suivie de `/auth/callback`, puis de
    `/auth/confirm`.
- [ ] *Authentication → Users → Add user* : ton email, un mot de passe, case
      « Auto Confirm User » cochée. C'est ton compte admin, et ce sera aussi
      ton compte de porteur pendant le test.
- [ ] *Project Settings → API* : noter l'URL du projet, la clé publique
      (`anon`, ou « publishable ») et la clé secrète (`service_role`, ou
      « secret »). La clé secrète ne va que dans Vercel.

Bon à savoir : tant que les emails de Supabase ne passent pas par Resend
(étape 6 du chemin vers J0), Supabase n'écrit qu'aux membres de l'équipe du
projet, 2 emails par heure. Ton compte, créé à la main, n'en a pas besoin.

## 3. Upstash (5 minutes)

- [ ] *Create Database* → Redis, région UE. Onglet « REST API » : noter
      `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.

## 4. Stripe, en mode test (20 minutes)

Tout se fait avec le mode test activé (bouton en haut du tableau de bord).

- [ ] *Catalogue de produits* : « T-shirt », prix unique de 49 €, et
      « Premium », prix récurrent mensuel de 2,99 €, tous deux taxes incluses
      (*inclusive*). Noter les deux identifiants `price_…`.
- [ ] *Développeurs → Clés API* : la clé secrète `sk_test_…`.
- [ ] *Développeurs → Webhooks* → ajouter un endpoint :
  - adresse : `https://<adresse du site>/api/webhook/stripe` ;
  - événements : `checkout.session.completed`,
    `customer.subscription.updated`, `customer.subscription.deleted`,
    `charge.refunded`, `invoice.payment_failed` ;
  - noter son secret `whsec_…`.
- [ ] *Paramètres → Facturation → Portail client* : activé, résiliation à la
      fin de la période (pour tester la résiliation du premium).

## 5. Resend (10 minutes)

- [ ] Créer une clé API.
- [ ] Tant que le domaine d'envoi n'est pas vérifié
      (`MISE_EN_PRODUCTION.md`, section 4), Resend n'envoie que depuis
      `onboarding@resend.dev`, et seulement à l'adresse de ton compte
      Resend. Pour le test : `EMAIL_FROM` à
      `In Real Society <onboarding@resend.dev>`, et cette adresse pour
      acheter. À retirer une fois le domaine vérifié.

## 6. Vercel (15 minutes)

- [ ] *Settings → Domains* : noter l'adresse de production
      (`https://….vercel.app`). C'est « l'adresse du site » des étapes
      précédentes.
- [ ] *Settings → Deployment Protection* : la production doit rester
      publique, sinon Stripe ne peut pas joindre le webhook. Le réglage par
      défaut ne protège que les préversions.
- [ ] *Settings → Environment Variables*, environnement *Production* :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | étape 2 |
| `NEXT_PUBLIC_APP_URL` | l'adresse du site, sans « / » final |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | étape 3 |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | étape 4 |
| `RESEND_API_KEY`, `EMAIL_FROM` | étape 5 |
| `ADMIN_EMAILS`, `ADMIN_ALERT_EMAIL` | ton email |
| `CRON_SECRET`, `INTERNAL_SECRET` | deux longues chaînes aléatoires, différentes (un mot de passe généré de 32 caractères convient) |

Facultatif : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` pour les notifications. Les générer avec
`npx web-push generate-vapid-keys` ; la clé publique va dans les deux
variables `…PUBLIC_KEY`.

- [ ] *Deployments* → dernier déploiement → *Redeploy* : les variables ne
      comptent qu'à partir de là.

## 7. Vérifier (5 minutes)

- [ ] `https://<adresse du site>/api/health` : `"supabase":"ok"` et
      `"upstash":"ok"`.
- [ ] `/auth/login` avec ton compte, puis `/admin` : la page s'ouvre.
      « Configuration » liste ce qui reste à régler. En test, c'est normal
      pour le domaine provisoire, les paiements de test, Printful, Sentry, le
      domaine court, et les notifications si tu les as laissées de côté.

## 8. Le parcours (30 minutes)

L'ordinateur pour le porteur et `/admin` ; le téléphone, en navigation
privée, pour le passant.

1. **Acheter** : `/shop`, couleur, taille, forme du QR et accroche, puis
   « Commander ». Sur la page de paiement : l'adresse de ton compte Resend,
   la carte `4242 4242 4242 4242`, une date future, n'importe quel code.
   L'email avec le code d'activation arrive ; le code est aussi dans
   `/admin` → recherche (ton email). Sans Printful, l'alerte « T-shirt payé
   non transmis à Printful » arrive aussi.
2. **Activer** : connecté avec ton compte, ouvrir le lien de l'email
   (`/register?code=…`) ; prénom, présentation, case 18 ans. Tu arrives dans
   « Mon espace ».
3. **Scanner** : `/admin` → recherche (ton prénom) → « Voir le QR ». Le
   scanner avec l'appareil photo du téléphone : ton profil s'ouvre, comme
   pour un passant.
4. **Écrire, en passant** : « Lui envoyer un message », un texte, et si tu
   veux un email de contact (le lien de confirmation n'arrive qu'à l'adresse
   de ton compte Resend). « Envoyer » : « Signal envoyé. ». Garder la page
   ouverte par « Voir la conversation ».
5. **Répondre, en porteur** : « Mon espace » → « Messages » → la
   conversation → répondre. Le passant voit la réponse dans la conversation.
6. **Signaler et modérer** : en porteur, « Signaler » le message ; en
   passant, « Signaler ce profil ». Dans `/admin` → « À traiter » : bannir
   l'appareil, suspendre le profil, ou clore. Lever ensuite la suspension
   (« Mesures en cours »).
7. **Premium offert** : `/admin` → « Suivi des porteurs » → « Offrir le
   premium 4 semaines ». Dans « Mon espace », les réglages affichent
   « Premium offert jusqu'au … ». Puis « Arrêter le premium offert ».
8. **Premium payant** : « Mon espace » → réglages → case des CGV → « Passer
   premium », carte de test. Puis « Gérer ou résilier mon abonnement » →
   résilier : la date de fin s'affiche, l'email de confirmation arrive.
9. **Chiffres** : `/admin` → « Chiffres » et « Semaine par semaine » comptent
   ton scan et ton message.
10. **Rembourser** : Stripe, en mode test → *Paiements* → le paiement du
    t-shirt → *Rembourser*. Le profil passe en suspendu : il apparaît dans
    `/admin` → « Mesures en cours ».

## 9. Avant d'ouvrir

- Les données du test restent dans la base : supprimer le profil de test
  (« Mon espace » → réglages → « Supprimer mon compte ») ; les commandes de
  test se suppriment ensuite (requête fournie à ce moment-là).
- `EMAIL_FROM` retirée une fois le domaine d'envoi vérifié chez Resend.
- La suite du « Chemin vers J0 » : domaine définitif et `inreal.me`, offres
  payantes, emails de Supabase par Resend, Printful, paiement réel.
