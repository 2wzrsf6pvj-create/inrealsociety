# Journal de bord

> Trace des chantiers menés sur le projet : ce qui a été fait, pourquoi, ce qui
> reste à faire et les décisions en attente. Entrée la plus récente en haut.

---

## 2026-10-23 — Délivrabilité des emails : analyse et lot (#26)

### Analyse
Lu : l'envoi par Resend, les 19 modèles d'email, la newsletter, les relances
et les emails envoyés par Supabase. Les documentations de Resend, de Gmail et
de Supabase ont été lues par la recherche web : le réseau de la session refuse
resend.com.

**Déjà en ordre** :
- newsletter : double consentement, désinscription en un clic reconnue par
  Gmail, désinscrits toujours retirés ;
- email du passant confirmé avant toute réponse, avec un plafond par adresse ;
- un email de scan par jour au plus, un email de plafond par semaine au plus ;
- un code d'activation non envoyé est tracé et peut être renvoyé ;
- Resend génère la version texte et bloque d'office les adresses en rebond ou
  qui se sont plaintes. Exception : Gmail ne lui transmet pas les plaintes.

**Constats** :
1. Les refus de Resend étaient invisibles : `sendEmail` renvoyait `false`
   sans la raison, et cinq emails attendaient une exception qui n'arrivait
   jamais.
2. Aucun nouvel essai. Resend refuse au-delà de 10 requêtes par seconde pour
   tout le compte, et la newsletter enchaînait 10 envois à la fois sans pause.
3. Offre gratuite de Resend : 100 emails par jour et 3 000 par mois. Au-delà,
   tout est refusé, codes d'activation compris.
4. (Supabase) Sans SMTP personnalisé, la confirmation d'inscription et le mot
   de passe oublié ne partent qu'aux membres de l'équipe, 2 par heure.
5. Emails de scan sans réglage ni désinscription : un porteur lassé n'avait
   que « Signaler comme spam ».
6. Les liens écrits par un passant étaient recopiés dans l'email au porteur.
7. Pas d'adresse de réponse : une réponse à l'email premium, une rétractation
   par exemple, partait vers `noreply@`.
8. `docs/EMAIL_DELIVERABILITY.md` ne correspondait pas à Resend : SPF à la
   racine, DKIM en 3 CNAME, « 3 000 emails par jour ».
9. Resend recommande d'envoyer depuis un sous-domaine.

### Décisions de Clément
- Envoi depuis `mail.inrealsociety.com`.
- Emails de scan : un réglage, et un lien de désinscription en un clic.
- Liens écrits par les passants : masqués dans les emails.

### Fait
- **PR #26 fusionnée** (`df15c7e`), constats 1, 2 et 5 à 9 :
  - chaque refus est noté avec sa raison ;
  - nouvel essai sur débit dépassé ou panne, avec une clé d'idempotence :
    jamais de doublon ;
  - newsletter par lots de 100, une requête par lot ;
  - réponses vers hello@, ce que précisent les emails de conversation ;
  - expéditeur `noreply@mail.inrealsociety.com`, réglable par `EMAIL_FROM` ;
  - migration **061** : réglage « Email au premier scan du jour », et lien en
    un clic dans ces emails ;
  - liens masqués (« [lien] ») dans les messages cités par les emails ;
  - guide de délivrabilité réécrit, liste de mise en production complétée.
- Vérifié avant la fusion :
  - 620 tests ; intégration 46/46 sur une base neuve à 61 migrations ;
  - anciens comportements réintroduits un à un : les tests échouent ;
  - rendu des emails et du réglage, build.

### À faire — côté Clément
Détail : `docs/EMAIL_DELIVERABILITY.md`.
- [ ] Resend : vérifier `mail.inrealsociety.com` (SPF et MX sur
      `send.mail`, DKIM sur `resend._domainkey.mail`), et poser DMARC sur le
      domaine principal. Si le domaine principal est déjà vérifié et sert aux
      tests : `EMAIL_FROM=In Real Society <noreply@inrealsociety.com>` en
      attendant.
- [ ] Resend : offre Pro au lancement ; suivi des ouvertures et des clics
      désactivé.
- [ ] (Supabase) SMTP personnalisé avec Resend.
- [ ] Google Postmaster Tools : ajouter `inrealsociety.com`.
- [ ] Appliquer la migration **061**, après 059 et 060.

### Ensuite
- Reste de la priorité 2 : l'économie unitaire (marge sur 49 €). Il faudra les
  tarifs Printful de Clément.
- Priorité 3 (inventaire du 22/10) :
  - observabilité ;
  - app mobile ;
  - parrainage et newsletter ;
  - accessibilité ;
  - mises à jour (Next.js 14, actions GitHub sur Node 20) ;
  - petits restes.
- Emails, plus tard : un lien « ne plus recevoir les réponses » pour le
  passant.

---

## 2026-10-22 (nuit, suite) — CI de main réparée (#25)

- **PR #25 fusionnée** (`35753c7`). La CI de main avait échoué sur le commit
  du journal : un test du QR dépassait son délai de 5 s.
- Cause, mesurée : resvg relisait toutes les polices du système (131 Mo) à
  chaque rendu, alors que le QR ne contient aucun texte. Le test s'en passe
  désormais. La production n'utilise pas resvg.

---

## 2026-10-22 (nuit, suite) — Performance et référencement : analyse et lots (#23, #24)

### Analyse
Mesurée avec Lighthouse en mode mobile (4G lente simulée), sur un build de
production branché sur la base locale.
- Toutes les pages chargeaient environ 285 ko de JavaScript compressé pour la
  seule mise en page commune, avant leur propre code. Le tableau du build Next
  ne compte pas cette partie.
- La boutique chargeait environ 520 ko au total.

1. **Bug : les notifications du passant ne fonctionnaient pas.**
   - Pour tout visiteur non connecté, le middleware redirigeait `/sw.js` et
     `/manifest.json` vers la page de connexion.
   - Le navigateur refusait alors le service worker : le passant qui demandait
     « Me notifier de sa réponse » n'était jamais prévenu.
   - L'installation sur l'écran d'accueil était impossible, alors que l'iPhone
     l'exige pour les notifications.
2. La boutique envoyait à chaque visiteur les tracés de toutes les accroches
   (~230 ko compressés) pour n'en afficher qu'une.
3. PostHog (~60 ko) était chargé sur toutes les pages, même sans
   consentement.
4. Le client Supabase (~56 ko) était chargé sur toutes les pages pour le seul
   bouton « Connexion ».
5. Sentry faisait du suivi de performance dans le navigateur.
6. Partage de liens :
   - aucune image d'aperçu ;
   - celle du manifeste pointait vers un fichier inexistant ;
   - sans `metadataBase`, le domaine des images d'aperçu était celui que
     choisit Vercel, pas l'adresse de l'app.
7. Détails :
   - la FAQ manquait au sitemap ;
   - pas de données produit pour Google ;
   - pas d'URL canoniques ;
   - trois pages privées étaient indexables ;
   - plusieurs titres affichaient la marque en double ;
   - contrastes trop faibles sur la boutique.

### Décisions de Clément
- Sentry : les erreurs seulement dans le navigateur.
- Image d'aperçu : visuel typographique de la marque, remplaçable par un
  visuel conçu.

### Fait
- **PR #23 fusionnée** (`cd501ee`), constat 1 : `/sw.js` et
  `/manifest.json` sont servis à tous.
- **PR #24 fusionnée** (`efed890`), constats 2 à 7 :
  - l'aperçu de la boutique charge l'accroche choisie, à la demande ;
  - PostHog n'est chargé qu'après « Accepter » ;
  - Supabase n'est chargé que si une session existe ;
  - Sentry ne garde que les erreurs dans le navigateur ;
  - image d'aperçu (le ( • ) et la phrase de la marque) ;
  - `metadataBase`, URL canoniques, sitemap et données produit ;
  - pages privées non indexées ;
  - titres et contrastes corrigés.

| Page | Performance | Affichage principal | JavaScript chargé |
|---|---|---|---|
| Boutique | 74 → 93 | 5,6 → 3,2 s | ~520 → 143 ko |
| Accueil | 83 → 96 | 4,0 → 2,8 s | ~288 → 133 ko |
| Profil | 85 → 94 | 4,1 → 3,0 s | ~296 → 140 ko |
| FAQ | 87 → 95 | 3,9 → 2,8 s | ~285 → 129 ko |

- Accessibilité de la boutique : 92 → 100.
- Vérifié avant la fusion :
  - 571 tests et intégration 43/43 ;
  - lint, types, build et Playwright verts ;
  - contrôles dans le navigateur sur un build de production.
- Pas de migration.

### À faire — côté Clément
- [ ] Vérifier que `NEXT_PUBLIC_APP_URL` en production est le domaine
      définitif. Les emails, les QR codes et désormais les URL canoniques et
      l'image d'aperçu en dépendent.
- [ ] Après la mise en ligne :
      - partager un lien de la boutique (WhatsApp, LinkedIn) pour vérifier
        l'aperçu ;
      - déclarer le site et son sitemap (`/sitemap.xml`) dans Google Search
        Console.
- [ ] Facultatif : un visuel conçu (1200 × 630) pour remplacer l'image
      d'aperçu typographique.

### Ensuite
- Le plus gros élément affiché reste souvent le bandeau cookies : il attend le
  JavaScript, environ 3 s sur mobile lent. On pourra l'inclure dans le HTML de
  la page.
- Reste de la priorité 2 : l'économie unitaire (marge sur 49 €). Il faudra les
  tarifs Printful de Clément.
- Priorité 3 (inventaire du 22/10) :
  - observabilité ;
  - délivrabilité des emails ;
  - app mobile ;
  - parrainage et newsletter ;
  - accessibilité ;
  - mises à jour (Next.js 14, actions GitHub sur Node 20) ;
  - petits restes.

---

## 2026-10-22 (nuit) — Abonnement premium : analyse et lot (#22)

### Analyse de l'abonnement premium
Lu de bout en bout (paiement, webhook Stripe, réconciliation, résiliation,
emails) et rejoué sur mobile.

**Déjà en ordre** :
- impossible de payer deux abonnements : le serveur vérifie chez Stripe avant
  chaque paiement ;
- délai de grâce quand un renouvellement échoue ;
- réconciliation quotidienne, qui coupe un premium resté actif par erreur.

**Constats** :
1. Rien de juridique ne couvrait l'abonnement :
   - les CGV ne disaient rien du prix, du renouvellement, de la résiliation ni
     de la rétractation ;
   - les CGV n'étaient pas acceptées avant le paiement ;
   - l'email de bienvenue ne confirmait pas le contrat ;
   - aucune confirmation de résiliation (L215-1-1).
2. Suppression du compte : si l'annulation chez Stripe échouait, le compte
   disparaissait et le prélèvement continuait chaque mois.
3. Les boutons « Passer premium » et « Gérer ou résilier » ne réagissaient
   pas en cas d'erreur.
4. L'activation dépendait du seul webhook, qui ignorait les erreurs
   d'écriture : il répondait 200 et Stripe ne réessayait pas.
5. L'offre était mal présentée :
   - elle promettait des « stats avancées à venir » ;
   - « fenêtre scanner » est du jargon ;
   - le bandeau de l'onglet Messages menait au paiement sans montrer le prix.
6. Mise en production : le prix premium doit être réglé en TTC, et le portail
   Stripe sur une résiliation en fin de période.
7. La valeur perçue est mince, comme le notait déjà `RETENTION.md`.

### Décisions de Clément
- Rétractation : le premium démarre tout de suite ; qui se rétracte sous
  14 jours est remboursé en entier.
- Premium tel quel pour le lancement, mais corrigé. On décidera de l'enrichir
  avec les premières données de rétention (P0).

### Fait
- **PR #22 fusionnée** (`1289f30`), constats 1 à 6 :
  - CGV, article 8 « Abonnement premium », avec le formulaire de
    rétractation ;
  - CGV à cocher avant le paiement, vérifiées aussi par le serveur, avec leur
    date d'acceptation gardée chez Stripe ;
  - emails : la bienvenue reprend le contrat, une résiliation est confirmée
    avec sa date de fin (affichée aussi dans les réglages), et la fin du
    premium est annoncée ;
  - suppression du compte : tous les abonnements sont résiliés d'abord ; si
    Stripe ne répond pas, rien n'est supprimé ;
  - chaque email part une seule fois, quel que soit l'ordre des événements
    Stripe, et une écriture en échec fait réessayer Stripe ;
  - les boutons affichent leurs erreurs ; au retour de Stripe, la page attend
    la confirmation du paiement ;
  - l'offre présente le graphique des 7 jours, qui existe déjà ; le bandeau
    Messages mène à l'offre.
- Vérifié avant la fusion : 540 tests, intégration 43/43 sur base neuve à
  60 migrations, build. Pas de migration.
- **Piège découvert** : sur une modification, PostgREST 12 réapplique un
  filtre `.or()` aux valeurs déjà écrites. Une réservation réussie revient
  donc vide. Pour une réservation, utiliser des filtres simples (`eq`, `is`)
  ou une fonction SQL.

### À faire — côté Clément
- [ ] Stripe (`docs/MISE_EN_PRODUCTION.md`) :
      - prix premium en « inclusive » (TTC), sinon le porteur paie 3,59 € ;
      - portail client : résiliation à la fin de la période, mise à jour du
        moyen de paiement autorisée.
- [ ] Juriste :
      - l'article 8 des CGV et l'email de bienvenue premium ;
      - une clause sur un changement de prix en cours d'abonnement, absente
        aujourd'hui.
- [ ] Rétractation d'un premium : rembourser le paiement dans Stripe, puis
      annuler l'abonnement. La procédure est dans
      `docs/MISE_EN_PRODUCTION.md`.

### Ensuite
- Reste de la priorité 2 :
  - économie unitaire (marge sur 49 €) : il faudra tes tarifs Printful ;
  - performance et référencement.

---

## 2026-10-22 (fin de soirée) — Expérience du porteur fusionnée (#19, #20, #21)

### Analyse de l'expérience du porteur après l'activation
Rejouée sur mobile : tableau de bord avec données fictives, les 9 emails
rendus.
1. Des notifications pouvaient se perdre :
   - elles partaient en tâche de fond, sans attendre leur envoi, alors qu'une
     fonction Vercel peut s'arrêter dès la réponse envoyée ;
   - étaient concernés les emails de scan, de message, de réponse, de
     bienvenue et de premium, et les notifications push.
2. Plafond gratuit (3 conversations sur 7 jours) : le porteur n'était pas
   prévenu quand un passant était refusé.
3. Un email par scan : seul le même téléphone était filtré pendant 30 minutes.
   À une soirée, le porteur recevait des dizaines d'emails.
4. Compteur « Semaine » faux : il comptait parmi les scans chargés pour la
   liste « Derniers scans ». Sur mobile, les libellés des compteurs
   débordaient.
5. Le lien de parrainage contenait l'identifiant du profil. Le partager
   donnait l'adresse directe du profil, sans passer par le t-shirt.
6. Détails :
   - l'email « nouveau message » menait au tableau de bord ;
   - « En attente de toi » au milieu du vouvoiement ;
   - la marque était écrite de deux façons ;
   - l'email premium promettait des « stats avancées à venir ».
7. Rétention (`RETENTION.md`) : la carte des scans prévue reposait sur les
   coordonnées, que le lot RGPD a supprimées. Elle deviendra une carte des
   villes.

### Corrections de l'analyse
- Constat 2 : le compteur existait déjà dans l'onglet Messages (« 2/3
  conversations sur 7 jours », puis « Limite atteinte »). Seul l'email
  manquait.
- Constat 4 : le compteur plafonnait à 5, pas à 10, car le tableau de bord ne
  charge que 5 scans. La correction est la même.

### Décisions de Clément
- Plafond atteint : un email au porteur, une fois par semaine au plus.
- Email de nouveau scan : au premier scan de la journée seulement.
- Parrainage : un code dédié dans le lien.

### Fait
- **PR #19 fusionnée** (`cb3c4c7`), constats 1, 4 et 6, sans arbitrage :
  - les notifications partent avant la réponse, et chaque envoi rattrape sa
    propre erreur ;
  - le compteur « 7 jours » compte en base, sur la même fenêtre que le
    graphique premium ;
  - l'email « nouveau message » mène à la conversation ;
  - les emails sont signés « In Real Society », et le vouvoiement est rétabli.
- **PR #20 fusionnée** (`3729d51`), constats 2 et 3 :
  - un email de scan par jour au plus (heure de Paris) ;
  - « Quelqu'un a essayé de vous écrire », une fois par semaine au plus ;
  - migration **059**.
- **PR #21 fusionnée** (`4f4dd36`), constat 5 :
  - le lien devient `/join/<code>`, avec un code de 10 caractères ;
  - les anciens liens donnent toujours la remise ;
  - migration **060**.
- Vérifié avant les fusions : 522 tests, intégration 34/34 sur base neuve à
  60 migrations, build. Après chaque fusion, la branche suivante a été remise à
  jour sans changer son contenu testé.

### À faire — côté Clément
- [ ] Appliquer les migrations **059** puis **060**
      (`docs/MISE_EN_PRODUCTION.md`). Sans elles, rien ne casse :
      - les emails de scan partent comme avant ;
      - l'email de plafond ne part pas ;
      - le tableau de bord garde l'ancien lien de parrainage, qui donne
        toujours la remise.
- [ ] Rétention (`RETENTION.md`, § 7) : trancher, à l'intuition, la cause
      principale d'abandon.
      - (a) Ils arrêtent de porter le t-shirt.
      - (b) Ils le portent, mais résilient le premium.

      Les mesures déjà en place (P0) trancheront avec les données.

### Ensuite
- Reste de la priorité 2 :
  - abonnement premium : parcours et valeur perçue ;
  - économie unitaire (marge sur 49 €) ;
  - performance et référencement.

---

## 2026-10-22 (soirée, suite) — Lot RGPD fusionné, liste de mise en production

### Fait
- **PR #18 fusionnée** (`8bf80ec`), lot RGPD (constats 3 à 7 de l'entrée
  précédente, décisions de Clément) :
  - le porteur ne voit que la ville du passant : position arrondie (~1 km)
    avant OpenStreetMap, plus aucune coordonnée stockée ;
  - migration **058** : conversations purgées 12 mois après le dernier
    message, preuves RGPD bornées à 5 ans, anciennes coordonnées effacées ;
  - « Signaler ce profil » (formulaire, alerte à `ADMIN_ALERT_EMAIL`) ;
  - liens « Vos données », « Gérer ou résilier mon abonnement », article
    Modération dans les CGV, politique de confidentialité complétée.
- **`docs/MISE_EN_PRODUCTION.md`** : la liste de Clément, tout ce qui se règle
  hors du code, dans l'ordre, avec la façon de vérifier. Upstash y est classé
  **bloquant** : sans lui, QR codes, scans et messages répondent 500.

### À faire — côté Clément
- [ ] Suivre `docs/MISE_EN_PRODUCTION.md`, dont la migration **058**.
- [ ] Juriste : en plus de la rétractation, la clause « délais de livraison
      indicatifs » (probablement abusive en vente aux particuliers) et
      l'email de confirmation de résiliation (L215-1-1).

### Ensuite
- Priorité 1 bouclée côté code. Priorité 2, choix de Clément : **expérience
  du porteur** après l'activation (tableau de bord, notifications, relances).

---

## 2026-10-22 (soirée) — Lot UX passant fusionné, analyse RGPD et juridique

### Fait
- **PR #17 fusionnée** (`578f9e3`), lot UX passant (constats 2 à 7 de
  l'entrée précédente) :
  - prénom et contact en tête de la page d'envoi, avant les réponses
    rapides, qui partent en un tap ;
  - « Retrouver votre conversation » remplace l'impasse « Envoyer un autre
    message » ;
  - chacun son tour, imposé par le serveur ;
  - porteur non genré ; vouvoiement, sauf les accroches « devenir porteur ».

### Analyse RGPD et juridique
**Déjà en ordre** :
- PostHog n'envoie et ne stocke rien avant consentement (serveurs UE) ;
- Sentry sans enregistrement de session ni IP ;
- suppression et export de compte complets ;
- purges hebdomadaires conformes aux durées annoncées (scans 24 mois,
  journaux 12 mois).

**Constats** :
1. Mentions légales et politique de confidentialité à trous : forme
   juridique, siège, SIRET/RCS, TVA, téléphone, directeur de publication.
   Aucun médiateur de la consommation, obligatoire pour vendre aux
   particuliers.
2. **Risque juridique** : les CGV excluent le droit de rétractation au motif
   du QR code unique. L'exception vise les biens faits selon les
   spécifications du client ; un code imposé par le vendeur risque de ne pas
   suffire. Si elle tombe : 14 jours, portés à 12 mois faute d'information
   correcte. La boutique ne l'affiche pas avant le paiement (seulement dans
   les CGV).
3. Géolocalisation :
   - la position exacte du passant part chez OpenStreetMap, absent de la
     politique ;
   - les coordonnées stockées (environ 110 m) ne servent nulle part ;
   - la carte dit « ville », alors que le porteur voit le quartier.
4. Aucun lien vers la politique de confidentialité là où le passant donne ses
   données (profil, page d'envoi).
5. Abonnement premium : « Gérer mon abonnement » ne dit pas « résilier »,
   alors que la loi exige une résiliation en ligne explicite.
6. Règlement européen sur les services numériques : aucun moyen de signaler
   un profil ; la modération n'est pas décrite dans les CGV.
7. La politique ne dit pas que le porteur reçoit les données du passant, ne
   cite ni OpenStreetMap, ni la vérification d'email, ni les alertes de
   signalement. Les preuves de consentement sont gardées sans limite, alors
   qu'elle annonce 12 mois pour les journaux.

### Décisions de Clément
- Le porteur ne voit que la **ville** du passant ; les coordonnées ne sont
  plus stockées.
- **« Signaler ce profil »** : lien et formulaire, alerte à
  `ADMIN_ALERT_EMAIL`.
- Conversations supprimées **12 mois après le dernier message**.

### À faire — côté Clément
- [ ] Fournir les informations légales (constat 1) et choisir un médiateur
      de la consommation.
- [ ] Faire relire par un juriste : l'exception au droit de rétractation
      (constat 2), les CGV et la politique de confidentialité.

### Ensuite
- Lot RGPD : décisions ci-dessus, et constats 3 à 7.
- Puis la liste de vérifications de la production.

---

## 2026-10-22 (soir, suite) — Lot 4 fusionné, parcours du passant

### Fait
- **PR #16 fusionnée** (`6dc5b7b`), correctif bloquant : la conversation
  s'ouvre pour le passant, qui n'a pas de compte (constat 1 ci-dessous).
  - Seul l'appareil d'où il a écrit peut répondre en son nom.
  - Ailleurs, la page explique quoi faire, y compris au porteur déconnecté :
    « Connectez-vous pour répondre ».
- **PR #15 fusionnée** (`ce63c6f`), lot 4 : l'email du passant est vérifié
  (double confirmation) avant de recevoir les réponses du porteur.
  Migration **057**.
- Avant de fusionner, #15 et #16 ont été vérifiées ensemble : 491 tests,
  intégration 24/24, build. Après fusion, main est identique à la combinaison
  testée.
- CI de main après #12, #13 et #14 : un échec au build, dû au téléchargement
  d'une police Google (réseau, pas le code). Vert à la relance.

### Analyse du parcours du passant (scan → profil → message → conversation)
Parcours rejoué sur mobile (390 px), avec Supabase branché en local.

| # | Constat | Suite |
|---|---|---|
| 1 | **Bloquant** : la page conversation renvoyait le passant vers la connexion, depuis le premier commit. Tous les liens étaient touchés : bouton après l'envoi, « Retrouver votre conversation », email, notification. Invisible en local et en CI, où le middleware laisse tout passer sans clés Supabase | #16 ✅ |
| 2 | Prénom et contact sous le bouton « Envoyer », hors de l'écran sur téléphone. Or l'email est presque le seul moyen d'être prévenu sur iPhone. Texte d'aide inexact : « Sans contact, il ne pourra pas vous répondre » | lot UX passant |
| 3 | Retour sur le profil : le bouton principal « Envoyer un autre message » mène à un refus (un seul message par appareil) | lot UX passant |
| 4 | Porteur toujours au masculin : « Il pourra vous répondre », « Me notifier quand il répond », « À lui de répondre » | lot UX passant |
| 5 | Tutoiement et vouvoiement mélangés : carte de localisation, page du t-shirt pas encore activé | lot UX passant |
| 6 | L'alternance n'est pas imposée par le serveur : 4 messages d'affilée possibles en appelant l'API | lot UX passant |
| 7 | Détails : « ? » seul sur sa ligne, deux liens « Retour » empilés | lot UX passant |

### Décisions de Clément
- Fusion de #16, puis de #15.
- Prénom et contact au-dessus du bouton « Envoyer ».
- Vouvoiement côté passant, sauf l'accroche « Et si c'était toi qu'on
  scannait ? ».

### À faire — côté Clément (s'ajoute aux listes précédentes)
- [ ] Appliquer **057**, après 056. Sans elle, les messages partent, mais
      aucune réponse ne part par email au passant.
- [ ] Upstash est **indispensable** : vérifié en local, sans lui, la
      redirection des QR codes (`/r/…`) et l'envoi d'un message répondent en
      erreur 500.
- Constat sûr : un projet Vercel est relié au dépôt, qui déploie une
  préversion de chaque PR. S'il déploie aussi `main` en production, chaque
  fusion part en production : appliquer les migrations avant.

### Ensuite
- Lot UX passant (constats 2 à 7).
- Puis RGPD et juridique, et la liste de vérifications de la production.

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
