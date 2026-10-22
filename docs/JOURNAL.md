# Journal de bord

> Trace des chantiers menés sur le projet : ce qui a été fait, pourquoi, ce qui
> reste à faire et les décisions en attente. Entrée la plus récente en haut.

---

## 2026-10-22 (soir) — Sécurité des porteurs (priorité 1)

### Constats
Lecture du parcours du passant (scan → profil → message → conversation), côté
sécurité :
1. **Profils découvrables sans scanner** : le plan du site listait tous les
   profils, lisible par toute personne connectée. Pour un visiteur anonyme,
   Google compris, il était redirigé vers la connexion, tout comme
   `robots.txt`. Les pages profil étaient indexables, et les premiers codes QR
   ne faisaient que 2 caractères, faciles à parcourir un par un. La fenêtre
   pour écrire s'ouvre pour tout le monde dès qu'un profil est affiché.
2. **Champs non modérés** : le prénom du passant s'affichait en gras dans
   l'email « … vient de voir votre profil », sans filtre. Un scan se
   déclenche à distance, jusqu'à 48 fois par jour par adresse IP. Le contact
   des messages n'était pas modéré non plus.
3. **Signalements sans suite** : message masqué et ligne dans le journal,
   personne prévenu, bannissement à la main en SQL.
4. **Aucun âge minimum**, nulle part.
5. **Contact email du passant non vérifié** : les réponses du porteur y
   partent, même si c'est l'adresse d'un tiers.
6. **Limites connues** :
   - blocage par cookie, contourné en navigation privée ;
   - 3 messages de spam occupent les 3 créneaux d'un porteur gratuit pendant
     7 jours.

### Décisions de Clément
Profils introuvables sans scan ; 18 ans minimum ; alerte et bannissement
automatique au 3e porteur ; vérification de l'email du passant.

### Fait
- **PR #12 fusionnée** (`573bb8c`), lot 1 :
  - prénom (format imposé côté serveur, puis modération) et contact modérés ;
  - profils retirés du plan du site et marqués `noindex` ;
  - `robots.txt` et plan du site rendus publics ;
  - codes QR de 5 caractères minimum, avec la même taille de QR.
- **PR #13 fusionnée** (`9b817be`), lot 2 : migration **056** (table
  `message_reports`). Chaque signalement envoie une alerte à
  `ADMIN_ALERT_EMAIL`, et un appareil signalé par 3 porteurs différents est
  banni de toute la plateforme. Scénario testé sur une vraie base.
- **PR #14 fusionnée** (`f201dec`), lot 3 : 18 ans minimum. Case exigée à
  l'activation, mention sur la page de message, CGV, confidentialité, FAQ.
- Avant de fusionner, les 3 PR ont été vérifiées ensemble : 468 tests,
  intégration 18/18, build.

### À faire — côté Clément (s'ajoute aux listes précédentes)
- [ ] Appliquer **056**, après 053, 054 et 055.
- [ ] Vercel : renseigner `ADMIN_ALERT_EMAIL`, l'adresse qui reçoit les
      alertes de signalement.
- [ ] Vérifier qu'Upstash est configuré : sans lui, les scans et les messages
      renvoient une erreur serveur.
- [ ] Faire relire les clauses d'âge (CGV, confidentialité) avec le reste des
      textes juridiques.

### Ensuite
- **Lot 4** : vérification de l'email du passant.
- Puis : expérience du passant (UX), RGPD et juridique, liste de
  vérifications de la production.
- Déjà notés pour l'UX :
  - les champs prénom et contact sont placés sous le bouton « Envoyer » ;
  - « Il pourra vous répondre » quel que soit le genre du porteur ;
  - une carte de géolocalisation s'affiche à l'arrivée.

---

## 2026-10-22 (fin d'après-midi) — Parcours d'achat (UX)

### Contexte
- Clément n'est pas sûr qu'une base Supabase de production existe, ni de
  l'état de Vercel. Décision : **Supabase et Vercel entre parenthèses** ; on
  avance sur ce qui est sûr, dans le code. Pour lever le doute plus tard :
  ouvrir `/api/health` sur le site en production. `"supabase":"ok"` signifie
  qu'une base répond, `"skip"` qu'aucune n'est configurée, `"fail"` qu'elle
  est configurée mais ne répond pas.

### Analyse du parcours d'achat (boutique → paiement → activation)
Parcours rejoué dans un navigateur mobile (390 px), captures à l'appui.
Constats, du plus grave au moins grave, et lot qui les traite :

| # | Constat | Lot |
|---|---|---|
| 1 | Trois témoignages nommés, **inventés**, sur la boutique (pratique commerciale trompeuse) | 1 ✅ |
| 2 | Un acheteur qui paie sans activer son profil n'est relancé par personne, alors que son t-shirt est imprimé : les premiers scans tombent sur une page vide | 3 ✅ |
| 3 | Mobile : prix à 1,8 écran, bouton de paiement à 2,5 écrans, aucun appel à l'action avant | 2 ✅ |
| 4 | « Sans compte » : faux pour l'acheteur, qui crée un compte à l'activation | 1 ✅ |
| 5 | Email saisi deux fois (boutique, activation) ; Stripe le pré-remplissait déjà, contrairement à ce que disait l'analyse | 4 ✅ |
| 6 | Erreur d'activation « générez-en un » : aucun générateur n'existe | 1 ✅ |
| 7 | En-tête : « Membres » passait sous le bouton « Connexion », affiché aussi sur les pages du passant qui scanne | 1 ✅ |
| 8 | Ni la page de confirmation ni l'email ne récapitulent la commande | 4 ✅ |

Relevés en passant, non traités : le bouton « Connexion » flotte au-dessus du
contenu au défilement ; « Sans swipe » passe sur deux lignes sur mobile.

### Fait
- **PR #7 fusionnée** (`8170a8e`) — lot 1 : faux témoignages retirés,
  « Sans swipe », message d'erreur corrigé, en-tête sans chevauchement. Son
  job Playwright avait dépassé 15 min, bloqué au téléchargement des paquets
  Ubuntu avant tout test ; `main` intégrée dans la branche, CI de nouveau verte.
- **PR #8 fusionnée** (`6ce914b`) — lot 3 : le cron quotidien
  `activation-reminder` relance aussi les **commandes payées dont le code n'a
  jamais servi** : à J+2 puis J+7, deux fois au plus, jamais au-delà de
  30 jours, avec le code et le lien d'activation. Migration **055** ; sans
  elle, rien ne casse, seule cette relance ne part pas.
- **PR #9 fusionnée** (`5c48125`) — lot 2 : nom et prix en tête de colonne
  (1,1 écran au lieu de 1,8), barre d'achat fixe sur mobile, frais de port en
  une seule source et facturés TTC (`tax_behavior: 'inclusive'`) : sans cela,
  selon un réglage du compte Stripe, les « 5 € » affichés pouvaient devenir
  6 € débités.
- **PR #10 fusionnée** (`4e9b506`) — CI : le job Playwright installe
  Chromium sans `apt-get` (`--with-deps` retiré). L'image des runners GitHub a
  déjà les bibliothèques ; apt n'ajoutait que des polices et a fait dépasser
  15 min au job de la #7. Mesuré : installation 6 min → 12 s, job complet
  7 min 24 s → 1 min 32 s.
- **PR #11 fusionnée** (`0adc5d8`) — lot 4 : email de la boutique pré-rempli
  à l'activation (sessionStorage, même onglet, effacé au compte créé) ;
  récapitulatif de commande sur la page de confirmation (sans donnée
  personnelle) et dans l'email d'activation (article, accroche, livraison,
  total TTC, adresse, lien CGV). Un échec du récapitulatif n'empêche jamais
  l'envoi du code. Test d'intégration : ids de session simulés uniques par
  exécution, il se relance sur la même base.

### À faire — côté Clément (s'ajoute à la liste précédente)
- [ ] Appliquer **055** après 053 et 054 (même procédure ; avec la CLI, le
      `db push` qui suit le `repair` l'applique).
- [ ] Stripe, le jour de sa configuration : le Price du t-shirt doit être en
      « inclusive » (TTC), sinon la TVA s'ajoute aux 49 € affichés.
- [ ] Faire relire l'email de confirmation avec les CGV avant le lancement
      (confirmation de commande sur support durable, art. L221-13).

### Pas encore analysé (inventaire du 22/10)
Analysé jusqu'ici : sécurité de la base, plafond de conversations,
remboursement, CI et migrations, tunnel d'achat (test d'intégration et UX).

- **Priorité 1, avant tout lancement**
  - Parcours du passant qui scanne : scan → profil → message → conversation.
  - Sécurité des porteurs et modération : contournements, signalement,
    blocage. Aucun âge minimum n'apparaît nulle part (CGV, confidentialité,
    inscription, FAQ).
  - RGPD et légal : confidentialité, conservation, géolocalisation des scans,
    consentement ; mentions légales incomplètes (SIRET, médiateur) ; CGV ;
    obligations d'une plateforme qui héberge des messages (DSA).
  - État réel de la production (laissé de côté à la demande de Clément) :
    Supabase, variables Vercel, Stripe réel, Printful, `inreal.me`, DNS email.
- **Priorité 2**
  - Expérience du porteur après activation : tableau de bord, notifications,
    relances ; rétention (`docs/RETENTION.md` attend des arbitrages).
  - Abonnement premium (2,99 €/mois) : parcours et valeur perçue.
  - Économie unitaire : marge sur 49 € après Printful, Stripe, TVA, port.
  - Performance et référencement : 466 ko de JavaScript au premier
    affichage de `/shop` ; seul le t-shirt blanc a une vraie maquette.
- **Priorité 3** : observabilité, délivrabilité des emails, app mobile,
  parrainage, newsletter, accessibilité, mises à jour (Next.js 14, actions
  GitHub sur Node 20), petits restes (commentaires périmés, Gelato, pages
  démo).

---

## 2026-10-22 (suite) — Fusions et décisions produit

### Fusions
- **PR #2** fusionnée (`0a6c002`) : cron Vercel quotidien + build ESLint.
  Vercel déploie de nouveau (bloqué depuis le 11 juillet).
- **PR #1** fusionnée (`6abbcb3`) une fois verte (build, Playwright, Vercel) :
  migration 053, `fresh-setup.sql` généré, journal. `main` est verte.
- ⚠️ Fusionner ne touche pas la base : **la 053 reste à appliquer en prod**
  (cf. « À faire — côté Clément » plus bas).

### Décisions prises
- **Plafond de conversations → fenêtre glissante de 7 jours.** Une conversation
  occupe un créneau pendant 7 jours après son message racine (hors bloquées) ;
  avant, le compte portait sur tout l'historique et un porteur gratuit devenait
  injoignable après 3 messages. FAQ et Réglages alignés.
- **Remboursement d'un code déjà utilisé → suspension verrouillée.** Ma première
  recommandation (simple pause) ne tenait pas : le porteur lève la pause lui-même
  dans Réglages. Retenu : `members.suspended_at` (migration 054) + contrainte
  « suspendu ⇒ en pause » ; le webhook de remboursement suspend le profil activé
  par ce code (jamais sur un rachat) ; seul le support lève la suspension
  (`UPDATE members SET suspended_at = NULL, is_paused = false WHERE id = …`).
- **Petits écarts** (commentaires périmés, pages démo, lint bloquant en CI) :
  laissés de côté pour l'instant.

### Fait ensuite
- **PR #3 fusionnée** (`3e465bf`) une fois verte : plafond glissant de 7 jours
  (durée confirmée) + suspension verrouillée au remboursement (migration 054).
  416 tests ; 054 validée sur Postgres.
- **Migrations en prod — décidé : Supabase CLI.** Constat : application manuelle
  (pas de `config.toml`, checklist en `psql`), d'où les dérives. **PR #4 fusionnée** (`6ea355b`)
  (`chore/supabase-cli`) : `config.toml`, procédure `docs/SUPABASE_CLI.md`,
  README corrigé (il conseillait un `db push` qui, sans `repair`, rejouerait
  tout). Validé avec la CLI 2.121.0 sur une prod simulée : sans `repair` le
  dry-run propose 001…054 (dangereux) ; après `repair 001→053` il ne propose que
  054 ; `push` l'applique, le second répond « up to date ». Pas d'application
  automatique au merge tant qu'il n'y a pas de staging.
- **PR #5 fusionnée** (`8e8dfe6`) : lint **bloquant** en CI (il tournait en
  `continue-on-error` ; 4 erreurs avaient cassé `next build` et Vercel).
- **PR #6 fusionnée** (`10c1649`) : **test d'intégration du tunnel d'achat**
  contre une vraie base. Approche choisie faute de clés Stripe test / projet
  Supabase de test / Docker : les vraies routes (checkout → webhook paiement →
  `/r/<code>` → activation → scan → message → webhook remboursement) contre
  Postgres + PostgREST avec les migrations du dépôt ; Stripe, Printful, Resend,
  stockage, session Auth et Upstash simulés. 10 étapes ; nouveau job CI
  « Intégration tunnel » (postgres:16 + PostgREST v12.2.3), **sans secret**,
  ~1 min. Vérifié qu'il attrape une régression d'héritage du code court et un
  `REVOKE` de `record_scan` à `service_role`. Lancer en local :
  `integration/README.md`.
- Reste possible plus tard : le vrai E2E Stripe test mode
  (`e2e/tunnel.spec.ts`), qui exige un projet Supabase de test et des clés
  Stripe test en secrets GitHub.

### À faire — côté Clément, dans cet ordre
- [ ] SQL Editor : `scripts/verify-migrations.sql` → repérer ce qui manque.
- [ ] Appliquer **053** (faille de sécurité) puis **054** à la main, relancer
      `verify-migrations.sql` (tout « attendu »).
- [ ] Logs API Supabase : appels à `accounts_pending_profile`,
      `create_member_with_code`, `record_scan` avec un JWT utilisateur ?
- [ ] Vercel : vérifier que `main` est bien déployée en production.
- [ ] Supabase CLI (PR #4 fusionnée) : `supabase link` puis `migration repair` 001→054
      (cf. `docs/SUPABASE_CLI.md`) — ensuite, `db push` après chaque fusion.

---

## 2026-10-22 — Audit sécurité de la base + PR #1

### Contexte
1. **Analyse de bout en bout du projet** (stack, parcours achat → paiement →
   impression → activation → scan → message → conversation, crons, docs).
   État de santé au départ : `tsc` OK, 408 tests vitest OK, 1 erreur eslint.
2. **Domaine creusé : accès aux données** (RLS, fonctions SQL, routes API).
   Choisi parce qu'un défaut y coûte le plus (fuite d'emails, usurpation de
   porteur, harcèlement) et que les tests unitaires ne tournent pas contre une
   vraie base.

### Méthode
Les 52 migrations ont été appliquées sur un Postgres 16 local imitant Supabase
(rôles `anon` / `authenticated` / `service_role`, default privileges du schéma
`public`, schémas `auth` et `storage`). Les attaques ont été rejouées en se
faisant passer pour un utilisateur connecté (ce que fait PostgREST avec le JWT).

### Constats
| Gravité | Constat |
|---|---|
| 🔴 | 4 fonctions `SECURITY DEFINER` exécutables par tout utilisateur connecté (un signup suffit) : les `REVOKE` visaient `anon, public`, jamais `authenticated`, qui reçoit `EXECUTE` nominativement sous Supabase. |
| 🔴 | → `accounts_pending_profile()` : lecture des emails d'autres clients. |
| 🔴 | → `create_member_with_code()` : `short_code` et email arbitraires, donc vol du QR déjà imprimé d'un autre acheteur (son activation échoue ensuite). |
| 🟠 | → `record_scan()` : scans forgés sans limite ; `cleanup_old_data()` : purge à la demande. |
| 🟠 | `scripts/fresh-setup.sql` arrêté à 048 (sans le correctif 052 ni les colonnes 049/050 du checkout). |
| 🟡 | Un porteur pouvait réécrire les messages des scanneurs (`messages_update_own`). |
| 🟡 | Uploads Storage directs possibles, contournant `/api/member/avatar`. |
| ⚪ | `orders_select_own` cassée depuis 042 (toujours `permission denied`). |

Ce qui tient : tables sensibles fermées à `anon`, emails masqués par colonne
(042), contrôle de propriété sur les 11 routes API authentifiées, modèle
« lien-capability » des conversations cohérent, push protégé (SSRF, hijack).

### Fait — PR #1 (`fix/rls-definer-rpcs-authenticated`)
- Migration `053_close_definer_rpcs_to_authenticated.sql` (révocations, default
  privileges fail-safe, `messages` sans écriture client, `orders_select_own` et
  uploads Storage directs retirés).
- `scripts/build-fresh-setup.mjs` + `fresh-setup.sql` régénéré (53 migrations)
  + test `fresh-setup-sync.test.ts` contre toute nouvelle désynchronisation.
- `scripts/verify-migrations.sql` contrôle aussi `authenticated`.
- `docs/DEPLOY_CHECKLIST.md` à jour (049 → 053).
- Validé : migrations une par une et bundle d'un bloc donnent le même schéma ;
  exploits refusés ; flux backend, lecture publique et `get_own_member` OK.
  410 tests passent.
- PR suivie (CI, revues, conflits) par Claude jusqu'au merge.

### À faire — côté Clément (production)
- [ ] Vérifier l'exposition : `select has_function_privilege('authenticated', 'accounts_pending_profile()', 'EXECUTE');`
- [ ] Vérifier que 049 → 052 sont appliquées, puis appliquer **053** sans attendre le merge.
- [ ] Lancer `scripts/verify-migrations.sql`.
- [ ] Chercher dans les logs API Supabase des appels à `/rest/v1/rpc/accounts_pending_profile`, `create_member_with_code`, `record_scan` (tout appel avec un JWT utilisateur est suspect → évaluer une notification CNIL, 72 h).

### Décisions prises
- **Vercel bloqué** : tous les déploiements échouaient (`main` compris) car le
  plan Hobby n'accepte que des crons quotidiens, et `fulfillment-reconcile`
  tournait toutes les 6 h depuis le 11 juillet. Décision : **passer en
  quotidien** (05:00 UTC) plutôt que le plan Pro → PR #2
  (`fix/vercel-daily-cron`). Le filet de relance des commandes non imprimées
  passe de 6 h à 24 h de délai max. À vérifier côté Clément : quel commit est
  réellement en production sur Vercel (sans doute antérieur au 11 juillet).
- **CI rouge sur `main` aussi** : `next build` échouait sur 4 variables
  inutilisées (code mort, dont le `safeName` relevé à l'analyse — jamais affiché
  depuis l'origine, donc retiré et non réutilisé). Corrigé dans la même PR #2,
  rebaptisée « débloque Vercel et la CI ». Build complet validé en local.
  Ordre de fusion : **#2 puis #1** (puis merge de `main` dans #1).
- **PR #2 fusionnée** (squash `0a6c002`) une fois verte : build GitHub,
  Playwright et déploiement Vercel OK — premier déploiement Vercel réussi
  depuis le 11 juillet. `main` réintégrée dans #1 (sans conflit).

### Décisions en attente (état au moment de l'audit)
- ~~**Plafond de 3 conversations (gratuit)**~~ → tranché : fenêtre glissante
  (voir l'entrée « Suite » ci-dessus).
- ~~**`safeName` inutilisé**~~ (`src/lib/email-templates.ts:135`) → réglé dans
  PR #2 : code mort depuis l'origine, retiré.
- ~~**Remboursement d'un code déjà utilisé**~~ → tranché : suspension verrouillée
  (voir l'entrée « Suite » ci-dessus).

### Autres écarts relevés (non traités)
- Commentaires périmés : en-têtes de `api/shop/checkout` et `lib/fulfillment.ts`
  (« QR généré à l'activation » → désormais au paiement).
- Gelato : suivi et annulation encore spécifiques à Printful.
- Pages `/demo-message` et `/demo-notif` encore publiques (« à retirer »).
- Avant lancement : mentions légales (SIRET, médiateur), DNS email
  (SPF/DKIM/DMARC), test E2E du tunnel d'achat avec Stripe en mode test.
